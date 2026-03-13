import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AppLanguage, ExerciseAiInfo, SessionExerciseSet } from "@/db/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatLocalTime(date: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatLocalDate(date: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatSessionDateLabel(
  value: Date | string,
  language: AppLanguage,
  options?: { omitTodayLabel?: boolean }
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const today = new Date();
  const diffMs = startOfLocalDay(today).getTime() - startOfLocalDay(date).getTime();
  const dayDiff = Math.round(diffMs / 86_400_000);

  if (dayDiff < 0) {
    return `${formatLocalDate(date, language)}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff === 0) {
    if (options?.omitTodayLabel) {
      return formatLocalTime(date, language);
    }
    const prefix = language === "de" ? "Heute" : "Today";
    return `${prefix}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff === 1) {
    const prefix = language === "de" ? "Gestern" : "Yesterday";
    return `${prefix}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff < 14) {
    return language === "de" ? `Vor ${dayDiff} Tagen, ${formatLocalTime(date, language)}` : `${dayDiff} days ago, ${formatLocalTime(date, language)}`;
  }

  return formatLocalDate(date, language);
}

export function formatNumber(value: number | undefined, fractionDigits = 0) {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

export function formatWeightValue(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(value);
}

export function getSetRepsValue(set: Pick<SessionExerciseSet, "actualReps" | "targetReps">) {
  return set.actualReps ?? set.targetReps;
}

export function getSetWeightValue(set: Pick<SessionExerciseSet, "actualWeight" | "targetWeight">) {
  return set.actualWeight ?? set.targetWeight;
}

export function getWeightInputValue(weight: number) {
  return weight < 0 ? Math.abs(weight) : weight;
}

export function normalizeWeightInputValue(value: number, negativeWeightEnabled: boolean) {
  if (value === 0) {
    return 0;
  }
  return negativeWeightEnabled ? -Math.abs(value) : value;
}

export interface SessionSetNormalizationMeta {
  negativeWeightEnabled?: boolean;
  exerciseAiInfo?: ExerciseAiInfo;
  exerciseName?: string;
}

const ASSISTED_EXERCISE_NAME_PATTERN = /\bassist(?:ed|iert)?\b/i;

function isAssistedExerciseName(value?: string) {
  return typeof value === "string" && ASSISTED_EXERCISE_NAME_PATTERN.test(value);
}

function normalizeNegativeSetWeight(weight: number | undefined) {
  if (weight === undefined) {
    return undefined;
  }

  return weight === 0 ? 0 : -Math.abs(weight);
}

export function resolveSessionSetNegativeWeightEnabled(
  set: Pick<
    SessionExerciseSet,
    "exerciseName" | "exerciseAiInfo" | "negativeWeightEnabled" | "actualWeight" | "targetWeight"
  >,
  fallbackMeta?: SessionSetNormalizationMeta
) {
  return (
    fallbackMeta?.negativeWeightEnabled === true ||
    set.negativeWeightEnabled === true ||
    (set.actualWeight ?? set.targetWeight) < 0 ||
    set.targetWeight < 0 ||
    isAssistedExerciseName(set.exerciseName) ||
    isAssistedExerciseName(set.exerciseAiInfo?.matchedExerciseName) ||
    isAssistedExerciseName(fallbackMeta?.exerciseName) ||
    isAssistedExerciseName(fallbackMeta?.exerciseAiInfo?.matchedExerciseName)
  );
}

export function normalizeSessionExerciseSet<
  T extends Pick<
    SessionExerciseSet,
    "exerciseName" | "exerciseAiInfo" | "negativeWeightEnabled" | "actualWeight" | "targetWeight"
  >
>(set: T, fallbackMeta?: SessionSetNormalizationMeta): T {
  const negativeWeightEnabled = resolveSessionSetNegativeWeightEnabled(set, fallbackMeta);
  if (!negativeWeightEnabled) {
    return set;
  }

  const normalizedActualWeight = normalizeNegativeSetWeight(set.actualWeight);
  const normalizedTargetWeight = normalizeNegativeSetWeight(set.targetWeight);

  if (
    set.negativeWeightEnabled === true &&
    set.actualWeight === normalizedActualWeight &&
    set.targetWeight === normalizedTargetWeight
  ) {
    return set;
  }

  return {
    ...set,
    negativeWeightEnabled: true,
    actualWeight: normalizedActualWeight,
    targetWeight: normalizedTargetWeight
  };
}

export function formatDurationClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatDurationLabel(durationMinutes: number, language: "de" | "en") {
  const roundedMinutes = Math.max(0, Math.round(durationMinutes));
  if (roundedMinutes < 60) {
    return language === "de" ? `${roundedMinutes} Minuten` : `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return language === "de"
    ? `${hours}:${String(minutes).padStart(2, "0")} h`
    : `${hours}:${String(minutes).padStart(2, "0")} h`;
}

export function getSetStatsMultiplier(set: Pick<SessionExerciseSet, "x2Enabled">) {
  return set.x2Enabled ? 2 : 1;
}

/**
 * Returns the effective weight for a set, taking bodyweight into account.
 * weight === 0 → pure bodyweight exercise → returns bodyWeightKg
 * weight < 0  → assisted exercise (e.g. machine-assisted pull-up) → returns max(0, bodyWeightKg + weight)
 * weight > 0  → regular exercise → returns weight as-is
 */
export function getEffectiveSetWeight(weight: number, bodyWeightKg: number): number {
  if (weight === 0) return bodyWeightKg;
  if (weight < 0) return Math.max(0, bodyWeightKg + weight);
  return weight;
}

export function getSetTotalWeight(
  set: Pick<SessionExerciseSet, "actualReps" | "targetReps" | "actualWeight" | "targetWeight" | "x2Enabled">,
  bodyWeightKg: number
) {
  return getEffectiveSetWeight(getSetWeightValue(set), bodyWeightKg) * getSetRepsValue(set) * getSetStatsMultiplier(set);
}
