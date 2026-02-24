import type { WeightUnit } from "@/db/types";

export const DEFAULT_BODY_WEIGHT_KG = 75;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toKilograms(weight: number, unit: WeightUnit) {
  return unit === "lb" ? weight * 0.45359237 : weight;
}

export function resolveCaloriesBodyWeightKg(bodyWeight: number | undefined, weightUnit: WeightUnit) {
  if (typeof bodyWeight === "number" && Number.isFinite(bodyWeight) && bodyWeight > 0) {
    return {
      bodyWeightKg: toKilograms(bodyWeight, weightUnit),
      usesDefaultBodyWeight: false
    };
  }

  return {
    bodyWeightKg: DEFAULT_BODY_WEIGHT_KG,
    usesDefaultBodyWeight: true
  };
}

export function estimateStrengthTrainingCalories({
  durationMinutes,
  bodyWeightKg,
  completedSetCount,
  repsTotal
}: {
  durationMinutes: number;
  bodyWeightKg: number;
  completedSetCount: number;
  repsTotal: number;
}) {
  const safeDuration = Math.max(1, durationMinutes);
  const setsPerMinute = completedSetCount / safeDuration;
  const repsPerMinute = repsTotal / safeDuration;

  // Heuristic: map observed workout density to the Compendium's moderate (3.5 MET)
  // to vigorous (6.0 MET) resistance-training range.
  const densityScore =
    clamp((setsPerMinute - 0.25) / 0.75, 0, 1) * 0.6 +
    clamp((repsPerMinute - 3) / 17, 0, 1) * 0.4;
  const met = 3.5 + densityScore * (6.0 - 3.5);

  return (met * 3.5 * bodyWeightKg * safeDuration) / 200;
}

export function getSessionDurationMinutes(startedAt: string, finishedAt?: string) {
  const startedMs = new Date(startedAt).getTime();
  const finishedMs = new Date(finishedAt ?? startedAt).getTime();
  return clamp((finishedMs - startedMs) / 60_000, 1, 24 * 60);
}
