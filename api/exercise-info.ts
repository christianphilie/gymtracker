import { buildExerciseInfoForMatch, matchExerciseCatalogEntry } from "../src/lib/exercise-catalog";

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

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const locale = body.locale === "en" ? "en" : "de";
  const exerciseNames = Array.isArray(body.exerciseNames)
    ? body.exerciseNames
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 50)
    : [];

  if (exerciseNames.length === 0) {
    res.status(400).json({ error: "exerciseNames is required" });
    return;
  }

  const exercises = exerciseNames.flatMap((inputName) => {
    const match = matchExerciseCatalogEntry(inputName);
    if (!match) {
      return [];
    }
    return [buildExerciseInfoForMatch(match, locale, inputName)];
  });

  res.status(200).json({
    exercises,
    unmatchedExerciseNames: exerciseNames.filter((name) => !matchExerciseCatalogEntry(name)),
    sourceProvider: "local-catalog",
    sourceModel: "exercise-catalog-v1"
  });
}
