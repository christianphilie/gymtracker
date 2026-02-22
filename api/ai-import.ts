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
  const text = payload?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    res.status(502).json({ error: "AI response did not contain content" });
    return;
  }

  res.status(200).json({ jsonText: text });
}
