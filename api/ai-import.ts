const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (value: unknown) => void;
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
  const planText = typeof body.planText === "string" ? body.planText.trim() : "";
  const locale = body.locale === "en" ? "en" : "de";
  const promptTemplate = typeof body.promptTemplate === "string" ? body.promptTemplate : "";

  if (!planText) {
    res.status(400).json({ error: "planText is required" });
    return;
  }

  const systemMessage =
    locale === "de"
      ? "Du bist ein präziser Datenkonverter für Trainingspläne. Gib ausschließlich valides JSON zurück – kein Markdown, keine Erklärungen, keine Code-Blöcke. Das JSON muss direkt parsebar sein. Richte alle erzeugten Textfelder nach der angeforderten Sprache aus."
      : "You are a precise data converter for workout plans. Return only valid JSON – no markdown, no explanations, no code blocks. The JSON must be directly parseable. Keep all generated text fields in the requested locale.";

  const userMessage =
    locale === "de"
      ? [
          "Konvertiere den folgenden Trainingsplan in das vorgegebene JSON-Schema.",
          "Wichtige Regeln:",
          "- Gib NUR das JSON zurück, kein ```json oder andere Umrahmungen",
          "- Alle Zahlen (targetReps, targetWeight) müssen echte Zahlen sein, keine Strings",
          "- targetWeight darf 0 sein, wenn kein Gewicht angegeben ist",
          "- Optionales Feld x2Enabled nur als boolean setzen (true/false), bevorzugt nur bei true ausgeben",
          "- Das Feld 'notes' weglassen wenn keine Anmerkungen vorhanden sind",
          "- Kein leeres notes-Feld und keine anderen Extrafelder hinzufügen",
          "- Schreibe alle erzeugten Textfelder (z. B. Namen/Notizen) auf Deutsch passend zur App-Sprache",
          "",
          "Zielschema:",
          promptTemplate,
          "",
          "Trainingsplan:",
          planText
        ].join("\n")
      : [
          "Convert the following workout plan into the given JSON schema.",
          "Important rules:",
          "- Return ONLY the JSON, no ```json or other wrapping",
          "- All numbers (targetReps, targetWeight) must be real numbers, not strings",
          "- targetWeight may be 0 if no weight is specified",
          "- Optional field x2Enabled must be a boolean (true/false), preferably only include it when true",
          "- Omit the 'notes' field if there are no notes",
          "- Do not add empty notes fields or any extra fields",
          "- Write generated text fields (e.g. names/notes) in English to match the app language",
          "",
          "Target schema:",
          promptTemplate,
          "",
          "Workout plan:",
          planText
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
  let text = payload?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    res.status(502).json({ error: "AI response did not contain content" });
    return;
  }

  // Strip any accidental markdown code fences
  text = text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  res.status(200).json({ jsonText: text });
}
