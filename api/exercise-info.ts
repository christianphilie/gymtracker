const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (value: unknown) => void;
}

interface RawExerciseInfoItem {
  inputName?: unknown;
  targetMuscles?: unknown;
  executionGuide?: unknown;
  coachingTips?: unknown;
}

function sanitizeTargetMuscles(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ muscle: string; involvementPercent: number }>;
  }

  const sanitized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const muscle = typeof record.muscle === "string" ? record.muscle.trim() : "";
      const involvementPercent = Number(record.involvementPercent);
      if (!muscle || !Number.isFinite(involvementPercent)) return null;
      return {
        muscle,
        involvementPercent: Math.max(0, Math.min(100, Math.round(involvementPercent)))
      };
    })
    .filter((entry): entry is { muscle: string; involvementPercent: number } => entry !== null)
    .slice(0, 10);

  return sanitized;
}

function sanitizeTips(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function parseGroqContent(content: string, inputExerciseNames: string[]) {
  let text = content.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  const parsed = JSON.parse(text) as { exercises?: unknown };
  if (!Array.isArray(parsed.exercises)) {
    throw new Error("AI response did not include an exercises array");
  }

  const byInput = new Map<string, { inputName: string; targetMuscles: Array<{ muscle: string; involvementPercent: number }>; executionGuide: string; coachingTips: string[] }>();

  for (const item of parsed.exercises as RawExerciseInfoItem[]) {
    const inputName = typeof item.inputName === "string" ? item.inputName.trim() : "";
    const executionGuide = typeof item.executionGuide === "string" ? item.executionGuide.trim() : "";
    const targetMuscles = sanitizeTargetMuscles(item.targetMuscles);
    const coachingTips = sanitizeTips(item.coachingTips);

    if (!inputName || !executionGuide || targetMuscles.length === 0 || coachingTips.length === 0) {
      continue;
    }

    byInput.set(inputName.toLowerCase(), {
      inputName,
      targetMuscles,
      executionGuide,
      coachingTips
    });
  }

  return inputExerciseNames
    .map((inputName) => byInput.get(inputName.trim().toLowerCase()))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY is not configured" });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const locale = body.locale === "en" ? "en" : "de";
  const exerciseNames = Array.isArray(body.exerciseNames)
    ? body.exerciseNames
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 30)
    : [];

  if (exerciseNames.length === 0) {
    res.status(400).json({ error: "exerciseNames is required" });
    return;
  }

  const schemaHint = `{
  "exercises": [
    {
      "inputName": "exactly one of the provided exercise names",
      "targetMuscles": [
        { "muscle": "string", "involvementPercent": 0-100 integer }
      ],
      "executionGuide": "short but useful paragraph explaining execution",
      "coachingTips": ["tip 1", "tip 2", "tip 3"]
    }
  ]
}`;

  const systemMessage =
    locale === "de"
      ? "Du bist ein präziser Fitness-Assistenz-Datenlieferant. Gib ausschließlich valides JSON zurück, ohne Markdown, ohne Erklärungen, ohne Codeblöcke."
      : "You are a precise fitness assistant data provider. Return only valid JSON, with no markdown, no explanations, and no code fences.";

  const userMessage =
    locale === "de"
      ? [
          "Erzeuge strukturierte Übungsinformationen für eine Workout-App.",
          "Wichtig:",
          "- Gib NUR JSON zurück",
          "- Erzeuge genau ein Objekt pro Eingabename",
          "- `inputName` muss exakt dem jeweiligen Eingabenamen entsprechen",
          "- `targetMuscles` nur mit real beteiligten Muskeln, `involvementPercent` als Integer 0-100",
          "- Prozentwerte sollen die relative Beteiligung ausdrücken und in Summe ungefähr 100 ergeben",
          "- 4 bis 8 Muskel-Einträge bevorzugen",
          "- `executionGuide` als kompakte Anleitung zur Ausführung",
          "- `coachingTips` als kurze konkrete Hinweise (4 bis 8 Punkte)",
          `- Texte in ${locale === "de" ? "Deutsch" : "Englisch"}`,
          "- Keine zusätzlichen Felder hinzufügen",
          "",
          "Zielschema:",
          schemaHint,
          "",
          "Übungsnamen:",
          JSON.stringify(exerciseNames)
        ].join("\n")
      : [
          "Generate structured exercise information for a workout app.",
          "Important:",
          "- Return JSON ONLY",
          "- Produce exactly one object per input name",
          "- `inputName` must exactly match the corresponding input name",
          "- `targetMuscles` should contain only actually involved muscles, `involvementPercent` as integer 0-100",
          "- Percentages should express relative involvement and roughly sum to 100",
          "- Prefer 4 to 8 muscle entries",
          "- `executionGuide` should be a concise but useful execution guide",
          "- `coachingTips` should be short concrete tips (4 to 8 items)",
          "- Write all texts in English",
          "- Do not add extra fields",
          "",
          "Target schema:",
          schemaHint,
          "",
          "Exercise names:",
          JSON.stringify(exerciseNames)
        ].join("\n");

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ]
    })
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    res.status(502).json({ error: "AI provider request failed", detail: errorText });
    return;
  }

  const payload = await groqResponse.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    res.status(502).json({ error: "AI response did not contain content" });
    return;
  }

  try {
    const exercises = parseGroqContent(content, exerciseNames);
    res.status(200).json({
      exercises,
      sourceProvider: "groq",
      sourceModel: MODEL
    });
  } catch (error) {
    res.status(502).json({
      error: "AI response parse failed",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
