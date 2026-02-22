const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
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
      ? "Du extrahierst Trainingspläne aus Fließtext und gibst nur valides JSON zurück."
      : "You extract workout plans from plain text and return valid JSON only.";

  const userMessage = [
    "Convert this workout plan into the target JSON schema.",
    "Return JSON only, no markdown.",
    "",
    "Target schema / prompt template:",
    promptTemplate,
    "",
    "Workout plan source:",
    planText
  ].join("\n");

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ]
    })
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    res.status(502).json({ error: "AI provider request failed", detail: errorText });
    return;
  }

  const payload = await openaiResponse.json();
  const text = typeof payload.output_text === "string" ? payload.output_text : "";

  if (!text.trim()) {
    res.status(502).json({ error: "AI response did not contain output_text" });
    return;
  }

  res.status(200).json({ jsonText: text });
}
