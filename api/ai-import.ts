import {
  buildAiImportPrompt,
  repairImportPayload,
  trainingPlanImportResponseJsonSchema
} from "../src/features/import/import-utils";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_GENERATION_ATTEMPTS = 3;
const SUPPORTED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (value: unknown) => void;
}

interface ImportFilePayload {
  name?: unknown;
  mimeType?: unknown;
  data?: unknown;
  sizeBytes?: unknown;
}

function getApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
}

function isImportFilePayload(value: unknown): value is ImportFilePayload {
  return !!value && typeof value === "object";
}

function decodeBase64File(data: string) {
  return Buffer.from(data, "base64");
}

async function uploadGeminiFile(apiKey: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-length": String(file.buffer.byteLength),
      "x-goog-upload-header-content-type": file.mimeType
    },
    body: JSON.stringify({
      file: {
        display_name: file.name
      }
    })
  });

  if (!startResponse.ok) {
    throw new Error(`Gemini file upload start failed: ${await startResponse.text()}`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini file upload URL missing");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "content-type": file.mimeType,
      "x-goog-api-key": apiKey,
      "x-goog-upload-command": "upload, finalize",
      "x-goog-upload-offset": "0"
    },
    body: file.buffer
  });

  if (!uploadResponse.ok) {
    throw new Error(`Gemini file upload failed: ${await uploadResponse.text()}`);
  }

  const payload = (await uploadResponse.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string };
  };

  if (!payload.file?.name || !payload.file.uri || !payload.file.mimeType) {
    throw new Error("Gemini file upload did not return file metadata");
  }

  return payload.file;
}

async function deleteGeminiFile(apiKey: string, fileName: string) {
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
    method: "DELETE",
    headers: {
      "x-goog-api-key": apiKey
    }
  });
}

function extractCandidateText(payload: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}) {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function buildRetryInstruction(locale: "de" | "en", problem: string) {
  if (locale === "de") {
    return `RETRY: Deine letzte Antwort war für den Import nicht gültig. Problem: ${problem}. Gib jetzt ausschließlich ein einzelnes JSON-Objekt zurück, das exakt dem Schema entspricht. Wichtig: Das Top-Level muss ein Objekt mit "schemaVersion" und "workouts" als Array sein. Keine Erklärungen, kein Markdown, keine zusätzlichen Felder.`;
  }

  return `RETRY: Your previous response was not valid for import. Problem: ${problem}. Return exactly one JSON object that matches the schema. Important: the top level must be an object with "schemaVersion" and "workouts" as an array. No explanations, no markdown, and no extra fields.`;
}

async function generateValidImportJson(args: {
  apiKey: string;
  locale: "de" | "en";
  model: string;
  baseParts: Array<Record<string, unknown>>;
}) {
  let lastProblem = "";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const parts =
      attempt === 1 || !lastProblem
        ? args.baseParts
        : [...args.baseParts, { text: buildRetryInstruction(args.locale, lastProblem) }];

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": args.apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseJsonSchema: trainingPlanImportResponseJsonSchema
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      throw new Error(`AI provider request failed: ${await geminiResponse.text()}`);
    }

    const payload = (await geminiResponse.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      promptFeedback?: {
        blockReason?: string;
      };
    };

    const text = extractCandidateText(payload);

    if (!text) {
      lastProblem =
        payload.candidates?.[0]?.finishReason ?? payload.promptFeedback?.blockReason ?? "empty response";
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      lastProblem = "response was not valid JSON";
      continue;
    }

    const repaired = repairImportPayload(parsed);
    if (repaired.errors.length === 0 && repaired.repairedObject && repaired.drafts.length > 0) {
      return {
        jsonText: JSON.stringify(repaired.repairedObject)
      };
    }

    lastProblem = repaired.errors[0] ?? "response did not match the required import schema";
  }

  return {
    error:
      args.locale === "de"
        ? "Die KI konnte aus deiner Eingabe leider keinen gültigen Trainingsplan erzeugen. Bitte formuliere den Plan etwas klarer oder probiere eine andere Datei."
        : "The AI could not generate a valid workout plan from your input. Please make the plan clearer or try a different file.",
    detail: lastProblem || "unknown validation problem"
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY or GOOGLE_API_KEY is not configured" });
    return;
  }

  const parsedBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const body = typeof parsedBody === "object" && parsedBody ? (parsedBody as Record<string, unknown>) : {};
  const planText = typeof body.planText === "string" ? body.planText.trim() : "";
  const locale = body.locale === "en" ? "en" : "de";
  const filePayload = isImportFilePayload(body.file) ? body.file : null;

  if (!planText && !filePayload) {
    res.status(400).json({ error: "planText or file is required" });
    return;
  }

  let uploadedGeminiFileName = "";

  try {
    const baseParts: Array<Record<string, unknown>> = [];

    if (filePayload) {
      const fileName = typeof filePayload.name === "string" ? filePayload.name.trim() : "workout-upload";
      const mimeType = typeof filePayload.mimeType === "string" ? filePayload.mimeType.trim() : "";
      const encodedData = typeof filePayload.data === "string" ? filePayload.data.trim() : "";

      if (!mimeType || !SUPPORTED_FILE_TYPES.has(mimeType)) {
        res.status(400).json({ error: "Unsupported file type" });
        return;
      }

      if (!encodedData) {
        res.status(400).json({ error: "file.data is required" });
        return;
      }

      const fileBuffer = decodeBase64File(encodedData);
      if (fileBuffer.byteLength > MAX_FILE_BYTES) {
        res.status(413).json({ error: "Uploaded file is too large" });
        return;
      }

      const uploadedFile = await uploadGeminiFile(apiKey, {
        name: fileName,
        mimeType,
        buffer: fileBuffer
      });

      uploadedGeminiFileName = uploadedFile.name;
      baseParts.push({
        file_data: {
          mime_type: uploadedFile.mimeType,
          file_uri: uploadedFile.uri
        }
      });
    }

    baseParts.push({
      text: buildAiImportPrompt(locale, planText)
    });

    const result = await generateValidImportJson({
      apiKey,
      locale,
      model: MODEL,
      baseParts
    });

    if ("error" in result) {
      res.status(422).json({
        error: "AI returned invalid import data",
        detail: result.detail,
        userMessage: result.error
      });
      return;
    }

    res.status(200).json({ jsonText: result.jsonText });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: "AI import failed", detail });
  } finally {
    if (uploadedGeminiFileName) {
      void deleteGeminiFile(apiKey, uploadedGeminiFileName).catch(() => undefined);
    }
  }
}
