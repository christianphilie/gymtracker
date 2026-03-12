import type { ExerciseAiInfo, SessionExerciseSet, WorkoutIconKey } from "@/db/types";
import { buildExerciseAiInfoForCatalogMatch, matchExerciseCatalogEntry } from "@/lib/exercise-catalog";
import { getCanonicalMuscleGroup, isCanonicalMuscleKey } from "@/lib/muscle-taxonomy";
import { formatNumber, getSetRepsValue, getSetStatsMultiplier, getSetTotalWeight } from "@/lib/utils";

export interface WeeklyStatsWorkoutEntry {
  sessionId: number;
  workoutId: number;
  workoutName: string;
  workoutIcon?: WorkoutIconKey;
  weekdayLabel: string;
  startedAt: string;
  finishedAt: string | null;
  durationMinutes: number;
  setCount: number;
}

export type StatisticsPeriod = "week" | "month" | "year";
export type MuscleMetricMode = "reps" | "sets" | "weight";
export type YearlySessionsMetricMode = "workouts" | "duration" | "sets";
export type MuscleGroupKey = "back" | "shoulders" | "core" | "arms" | "chest" | "legs";

interface MuscleMetricAggregate {
  sets: number;
  reps: number;
  weight: number;
}

interface RadarPoint {
  x: number;
  y: number;
}

export type WeeklyMuscleGroupMetrics = Record<MuscleGroupKey, MuscleMetricAggregate>;

export interface WeeklyDashboardStats {
  workoutCount: number;
  durationMinutesTotal: number;
  setCount: number;
  repsTotal: number;
  totalWeight: number;
  caloriesTotal: number | null;
  usesDefaultBodyWeightForCalories: boolean;
  completedWorkouts: WeeklyStatsWorkoutEntry[];
  weeklyWeightGoal?: number;
  weeklyCaloriesGoal?: number;
  weeklyWorkoutCountGoal?: number;
  weeklyDurationGoal?: number;
  muscleGroupMetrics: WeeklyMuscleGroupMetrics;
}

export const MUSCLE_GROUP_ORDER: MuscleGroupKey[] = ["back", "shoulders", "core", "arms", "chest", "legs"];
export const STATS_PERIOD_SEARCH_PARAM = "period";
export const STATS_OFFSET_SEARCH_PARAM = "offset";
export const STATS_MUSCLE_METRIC_SEARCH_PARAM = "muscleMetric";
export const STATS_YEARLY_SESSIONS_METRIC_SEARCH_PARAM = "sessionsMetric";
const LEGACY_STATS_WEEK_SEARCH_PARAM = "week";

export function createEmptyMuscleGroupMetrics(): WeeklyMuscleGroupMetrics {
  return {
    back: { sets: 0, reps: 0, weight: 0 },
    shoulders: { sets: 0, reps: 0, weight: 0 },
    core: { sets: 0, reps: 0, weight: 0 },
    arms: { sets: 0, reps: 0, weight: 0 },
    chest: { sets: 0, reps: 0, weight: 0 },
    legs: { sets: 0, reps: 0, weight: 0 }
  };
}

export const EMPTY_WEEKLY_STATS: WeeklyDashboardStats = {
  workoutCount: 0,
  durationMinutesTotal: 0,
  setCount: 0,
  repsTotal: 0,
  totalWeight: 0,
  caloriesTotal: null,
  usesDefaultBodyWeightForCalories: false,
  completedWorkouts: [],
  weeklyWeightGoal: undefined,
  weeklyCaloriesGoal: undefined,
  weeklyWorkoutCountGoal: undefined,
  weeklyDurationGoal: undefined,
  muscleGroupMetrics: createEmptyMuscleGroupMetrics()
};

export function getWeekStart(date: Date) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + diff);
  return target;
}

export function getWeekEndExclusive(weekStart: Date) {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);
  return next;
}

export function getMonthStart(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(1);
  return target;
}

export function getYearStart(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setMonth(0, 1);
  return target;
}

export function getStatisticsPeriodStart(date: Date, period: StatisticsPeriod) {
  if (period === "month") {
    return getMonthStart(date);
  }

  if (period === "year") {
    return getYearStart(date);
  }

  return getWeekStart(date);
}

export function getStatisticsPeriodEndExclusive(periodStart: Date, period: StatisticsPeriod) {
  if (period === "month") {
    const next = new Date(periodStart);
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  if (period === "year") {
    const next = new Date(periodStart);
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  return getWeekEndExclusive(periodStart);
}

export function shiftStatisticsPeriodStart(periodStart: Date, period: StatisticsPeriod, amount: number) {
  const next = new Date(periodStart);

  if (period === "month") {
    next.setMonth(next.getMonth() + amount);
    return getMonthStart(next);
  }

  if (period === "year") {
    next.setFullYear(next.getFullYear() + amount);
    return getYearStart(next);
  }

  next.setDate(next.getDate() + amount * 7);
  return getWeekStart(next);
}

export function getStatisticsPeriodOffset(currentStart: Date, targetStart: Date, period: StatisticsPeriod) {
  if (period === "month") {
    return (
      (targetStart.getFullYear() - currentStart.getFullYear()) * 12 +
      (targetStart.getMonth() - currentStart.getMonth())
    );
  }

  if (period === "year") {
    return targetStart.getFullYear() - currentStart.getFullYear();
  }

  const diffMs = targetStart.getTime() - currentStart.getTime();
  return Math.floor(diffMs / (7 * 86_400_000));
}

export function parseStatisticsPeriod(value: string | null): StatisticsPeriod {
  if (value === "month" || value === "year") {
    return value;
  }

  return "week";
}

export function parseStatisticsOffset(value: string | null, legacyWeekValue?: string | null) {
  const raw = value ?? legacyWeekValue ?? null;
  if (raw === null) {
    return 0;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed > 0) {
    return 0;
  }

  return parsed;
}

export function parseMuscleMetricMode(value: string | null): MuscleMetricMode {
  if (value === "sets" || value === "weight") {
    return value;
  }

  return "reps";
}

export function parseYearlySessionsMetricMode(value: string | null): YearlySessionsMetricMode {
  if (value === "workouts" || value === "sets") {
    return value;
  }

  return "duration";
}

export function formatStatisticsPeriodLabel(
  periodStart: Date,
  period: StatisticsPeriod,
  language: "de" | "en"
) {
  if (period === "month") {
    return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      month: "short",
      year: "numeric"
    })
      .format(periodStart)
      .replace(/\.$/, "");
  }

  if (period === "year") {
    return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      year: "numeric"
    }).format(periodStart);
  }

  const start = new Date(periodStart);
  const end = new Date(periodStart);
  end.setDate(end.getDate() + 6);

  const startFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    day: "2-digit",
    month: "2-digit"
  });
  const endFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });

  return `${startFormatter.format(start)} – ${endFormatter.format(end)}`;
}

export function getStatisticsPeriodTitleKey(period: StatisticsPeriod) {
  if (period === "month") {
    return "monthlyData" as const;
  }

  if (period === "year") {
    return "yearlyData" as const;
  }

  return "weeklyData" as const;
}

export function getPreviousStatisticsPeriodLabelKey(period: StatisticsPeriod) {
  if (period === "month") {
    return "previousMonth" as const;
  }

  if (period === "year") {
    return "previousYear" as const;
  }

  return "previousWeek" as const;
}

export function getNextStatisticsPeriodLabelKey(period: StatisticsPeriod) {
  if (period === "month") {
    return "nextMonth" as const;
  }

  if (period === "year") {
    return "nextYear" as const;
  }

  return "nextWeek" as const;
}

export function clearLegacyStatisticsWeekParam(searchParams: URLSearchParams) {
  searchParams.delete(LEGACY_STATS_WEEK_SEARCH_PARAM);
}

export function normalizeWeeklyGoal(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function formatDurationShort(totalMinutes: number, language: "de" | "en") {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours <= 0) {
    return language === "de" ? `${minutes} Min` : `${minutes}m`;
  }

  if (minutes === 0) {
    return language === "de" ? `${hours} Std` : `${hours}h`;
  }

  return language === "de" ? `${hours} Std ${minutes} Min` : `${hours}h ${minutes}m`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function normalizeExerciseLookupName(value: string) {
  return value.trim().toLowerCase();
}

const catalogStatsAiInfoByExerciseName = new Map<string, ExerciseAiInfo | null>();

function getSetAiInfo(
  set: SessionExerciseSet,
  templateAiInfoById: Map<number, ExerciseAiInfo>,
  templateAiInfoByWorkoutAndName: Map<string, ExerciseAiInfo>,
  sessionWorkoutIdBySessionId: Map<number, number>
) {
  if (set.exerciseAiInfo) {
    return set.exerciseAiInfo;
  }
  if (set.templateExerciseId !== undefined) {
    const byId = templateAiInfoById.get(set.templateExerciseId);
    if (byId) {
      return byId;
    }
  }
  const workoutId = sessionWorkoutIdBySessionId.get(set.sessionId);
  const exerciseNameKey = normalizeExerciseLookupName(set.exerciseName);
  if (workoutId === undefined || !exerciseNameKey) {
    if (!exerciseNameKey) {
      return undefined;
    }
  } else {
    const byWorkoutAndName = templateAiInfoByWorkoutAndName.get(`${workoutId}::${exerciseNameKey}`);
    if (byWorkoutAndName) {
      return byWorkoutAndName;
    }
  }

  if (catalogStatsAiInfoByExerciseName.has(exerciseNameKey)) {
    return catalogStatsAiInfoByExerciseName.get(exerciseNameKey) ?? undefined;
  }

  const catalogMatch = matchExerciseCatalogEntry(set.exerciseName);
  if (!catalogMatch) {
    catalogStatsAiInfoByExerciseName.set(exerciseNameKey, null);
    return undefined;
  }

  const fallbackAiInfo = buildExerciseAiInfoForCatalogMatch(catalogMatch, "en");
  catalogStatsAiInfoByExerciseName.set(exerciseNameKey, fallbackAiInfo);
  return fallbackAiInfo;
}

export function addMuscleContributionFromSet(
  set: SessionExerciseSet,
  metrics: WeeklyMuscleGroupMetrics,
  templateAiInfoById: Map<number, ExerciseAiInfo>,
  templateAiInfoByWorkoutAndName: Map<string, ExerciseAiInfo>,
  sessionWorkoutIdBySessionId: Map<number, number>,
  bodyWeightKg: number
) {
  const aiInfo = getSetAiInfo(set, templateAiInfoById, templateAiInfoByWorkoutAndName, sessionWorkoutIdBySessionId);
  if (!aiInfo?.targetMuscles?.length) {
    return;
  }

  const groupPercentByKey = new Map<MuscleGroupKey, number>();
  for (const target of aiInfo.targetMuscles) {
    if (!isCanonicalMuscleKey(target.muscleKey)) continue;
    const group = getCanonicalMuscleGroup(target.muscleKey);
    const percent = clampPercent(Number(target.involvementPercent));
    if (!Number.isFinite(percent) || percent <= 0) continue;
    groupPercentByKey.set(group, (groupPercentByKey.get(group) ?? 0) + percent);
  }

  const totalPercent = [...groupPercentByKey.values()].reduce((sum, value) => sum + value, 0);
  if (totalPercent <= 0) {
    return;
  }

  const setMultiplier = getSetStatsMultiplier(set);
  const repsBase = getSetRepsValue(set) * setMultiplier;
  const weightBase = getSetTotalWeight(set, bodyWeightKg);

  for (const [group, percent] of groupPercentByKey.entries()) {
    const factor = percent / totalPercent;
    metrics[group].sets += setMultiplier * factor;
    metrics[group].reps += repsBase * factor;
    metrics[group].weight += weightBase * factor;
  }
}

export function getMuscleMetricValue(metrics: WeeklyMuscleGroupMetrics, group: MuscleGroupKey, mode: MuscleMetricMode) {
  return metrics[group][mode];
}

export function formatMuscleMetricValue(value: number, mode: MuscleMetricMode) {
  const digits = mode === "sets" ? 1 : 0;
  return formatNumber(value, digits);
}

function getDistance(a: RadarPoint, b: RadarPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function buildRoundedRadarPath(points: Array<{ x: number; y: number }>, cornerRadius = 2.5) {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
  }

  const corners = points.map((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const prevDistance = getDistance(point, prev);
    const nextDistance = getDistance(point, next);
    const radius = Math.min(cornerRadius, prevDistance / 2, nextDistance / 2);

    if (radius <= 0 || !Number.isFinite(radius)) {
      return { start: point, end: point, vertex: point };
    }

    const start = {
      x: point.x + ((prev.x - point.x) * radius) / prevDistance,
      y: point.y + ((prev.y - point.y) * radius) / prevDistance
    };
    const end = {
      x: point.x + ((next.x - point.x) * radius) / nextDistance,
      y: point.y + ((next.y - point.y) * radius) / nextDistance
    };

    return { start, end, vertex: point };
  });

  const [firstCorner] = corners;
  let path = `M ${firstCorner.start.x} ${firstCorner.start.y}`;
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    const nextCorner = corners[(index + 1) % corners.length];
    path += ` Q ${corner.vertex.x} ${corner.vertex.y} ${corner.end.x} ${corner.end.y}`;
    path += ` L ${nextCorner.start.x} ${nextCorner.start.y}`;
  }
  path += " Z";
  return path;
}

export function getMuscleGroupLabel(
  t: (key: "muscleGroupBack" | "muscleGroupShoulders" | "muscleGroupCore" | "muscleGroupArms" | "muscleGroupChest" | "muscleGroupLegs") => string,
  key: MuscleGroupKey
) {
  if (key === "back") return t("muscleGroupBack");
  if (key === "shoulders") return t("muscleGroupShoulders");
  if (key === "core") return t("muscleGroupCore");
  if (key === "arms") return t("muscleGroupArms");
  if (key === "chest") return t("muscleGroupChest");
  return t("muscleGroupLegs");
}
