import type { AppLanguage, ExerciseAiInfo } from "@/db/types";

const STORAGE_KEY = "gymtracker:exercise-ai-info-cache:v1";
const MAX_ENTRIES = 500;

interface CachedExerciseAiInfoEntry {
  info: ExerciseAiInfo;
  updatedAt: string;
}

type ExerciseAiInfoCacheStore = Record<string, CachedExerciseAiInfoEntry>;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase();
}

function buildCacheKey(language: AppLanguage, exerciseName: string) {
  return `${language}::${normalizeExerciseName(exerciseName)}`;
}

function readStore(): ExerciseAiInfoCacheStore {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ExerciseAiInfoCacheStore;
  } catch {
    return {};
  }
}

function writeStore(store: ExerciseAiInfoCacheStore) {
  if (!canUseStorage()) return;
  try {
    const entries = Object.entries(store);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => {
        const aTime = Date.parse(a[1]?.updatedAt ?? "") || 0;
        const bTime = Date.parse(b[1]?.updatedAt ?? "") || 0;
        return bTime - aTime;
      });
      const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors (quota/private mode)
  }
}

export function getCachedExerciseAiInfo(language: AppLanguage, exerciseName: string): ExerciseAiInfo | undefined {
  const key = buildCacheKey(language, exerciseName);
  const entry = readStore()[key];
  if (!entry || !entry.info) return undefined;
  return entry.info;
}

export function setCachedExerciseAiInfo(language: AppLanguage, exerciseName: string, info: ExerciseAiInfo) {
  const normalizedName = normalizeExerciseName(exerciseName);
  if (!normalizedName) return;

  const store = readStore();
  store[buildCacheKey(language, normalizedName)] = {
    info,
    updatedAt: new Date().toISOString()
  };
  writeStore(store);
}

export function setCachedExerciseAiInfoBatch(
  language: AppLanguage,
  entries: Array<{ exerciseName: string; info: ExerciseAiInfo }>
) {
  if (entries.length === 0) return;

  const store = readStore();
  const updatedAt = new Date().toISOString();

  for (const entry of entries) {
    const normalizedName = normalizeExerciseName(entry.exerciseName);
    if (!normalizedName) continue;
    store[buildCacheKey(language, normalizedName)] = {
      info: entry.info,
      updatedAt
    };
  }

  writeStore(store);
}
