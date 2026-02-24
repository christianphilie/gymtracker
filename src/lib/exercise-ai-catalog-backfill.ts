import { db } from "@/db/db";
import type { AppLanguage, Exercise, ExerciseAiInfo } from "@/db/types";
import { buildExerciseInfoForMatch, matchExerciseCatalogEntry } from "@/lib/exercise-catalog";

const BACKFILL_VERSION = "v1";
const BACKFILL_KEY_PREFIX = `gymtracker:exercise-ai-catalog-backfill:${BACKFILL_VERSION}`;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase();
}

function hasExerciseAiInfo(info: ExerciseAiInfo | undefined): info is ExerciseAiInfo {
  return !!(
    info &&
    Array.isArray(info.targetMuscles) &&
    info.targetMuscles.length > 0 &&
    typeof info.executionGuide === "string" &&
    info.executionGuide.trim() &&
    Array.isArray(info.coachingTips) &&
    info.coachingTips.length > 0
  );
}

function needsCatalogMatchMetadataBackfill(info: ExerciseAiInfo | undefined) {
  return hasExerciseAiInfo(info) && info.sourceProvider === "local-catalog" && !info.matchedExerciseName?.trim();
}

function buildBackfillKey(language: AppLanguage) {
  return `${BACKFILL_KEY_PREFIX}:${language}`;
}

function isBackfillDone(language: AppLanguage) {
  if (!canUseStorage()) return false;
  try {
    return window.localStorage.getItem(buildBackfillKey(language)) === "1";
  } catch {
    return false;
  }
}

function markBackfillDone(language: AppLanguage) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(buildBackfillKey(language), "1");
  } catch {
    // ignore storage errors
  }
}

export async function runExerciseAiCatalogBackfillIfNeeded(language: AppLanguage) {
  if (isBackfillDone(language)) {
    return;
  }

  const templateExercises = await db.exercises
    .filter((exercise) => exercise.isTemplate !== false)
    .toArray();

  const updates: Array<Exercise & { id: number }> = [];
  const now = new Date().toISOString();

  for (const exercise of templateExercises) {
    const normalizedName = normalizeExerciseName(exercise.name);
    if (!normalizedName) {
      continue;
    }

    const shouldBackfill = !hasExerciseAiInfo(exercise.aiInfo) || needsCatalogMatchMetadataBackfill(exercise.aiInfo);
    if (!shouldBackfill) {
      continue;
    }

    const match = matchExerciseCatalogEntry(exercise.name);
    if (!match) {
      continue;
    }

    const infoItem = buildExerciseInfoForMatch(match, language, exercise.name);
    const aiInfo: ExerciseAiInfo = {
      targetMuscles: infoItem.targetMuscles,
      executionGuide: infoItem.executionGuide,
      coachingTips: infoItem.coachingTips,
      generatedAt: now,
      sourceProvider: "local-catalog",
      sourceModel: "exercise-catalog-v1",
      matchedExerciseName: infoItem.matchedExerciseName,
      matchStrategy: infoItem.matchStrategy,
      matchScore: infoItem.matchScore
    };

    updates.push({
      ...exercise,
      aiInfo,
      updatedAt: now
    } as Exercise & { id: number });
  }

  if (updates.length > 0) {
    await db.exercises.bulkPut(updates);
  }

  markBackfillDone(language);
}

