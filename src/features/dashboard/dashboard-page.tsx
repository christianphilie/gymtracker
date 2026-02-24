import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChartNoAxesCombined,
  Clock3,
  Download,
  Dumbbell,
  Flame,
  ListChecks,
  OctagonX,
  PenSquare,
  Plus,
  Repeat,
  Sparkles,
  Weight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { db } from "@/db/db";
import { discardSession, ensureDefaultWorkout, startSession } from "@/db/repository";
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import { useSettings } from "@/app/settings-context";
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import { formatNumber, formatSessionDateLabel, getSetStatsMultiplier } from "@/lib/utils";

interface WorkoutListItem {
  id?: number;
  name: string;
  exerciseCount: number;
  lastSessionAt?: string;
  activeSessionId?: number;
  activeSessionStartedAt?: string;
  sortTimestamp: number;
}

interface WeeklyStatsWorkoutEntry {
  sessionId: number;
  workoutId: number;
  workoutName: string;
  weekdayLabel: string;
  startedAt: string;
  finishedAt: string | null;
  midpointAt: string;
}

interface WeeklyDashboardStats {
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

type MuscleMetricMode = "reps" | "sets" | "weight";
type MuscleGroupKey = "back" | "shoulders" | "core" | "arms" | "chest" | "legs";

interface MuscleMetricAggregate {
  sets: number;
  reps: number;
  weight: number;
}

interface RadarPoint {
  x: number;
  y: number;
}

type WeeklyMuscleGroupMetrics = Record<MuscleGroupKey, MuscleMetricAggregate>;

const MUSCLE_GROUP_ORDER: MuscleGroupKey[] = ["back", "shoulders", "core", "arms", "chest", "legs"];

function createEmptyMuscleGroupMetrics(): WeeklyMuscleGroupMetrics {
  return {
    back: { sets: 0, reps: 0, weight: 0 },
    shoulders: { sets: 0, reps: 0, weight: 0 },
    core: { sets: 0, reps: 0, weight: 0 },
    arms: { sets: 0, reps: 0, weight: 0 },
    chest: { sets: 0, reps: 0, weight: 0 },
    legs: { sets: 0, reps: 0, weight: 0 }
  };
}

const ACTIVE_SESSION_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";
const EMPTY_WEEKLY_STATS: WeeklyDashboardStats = {
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

function getWeekStart(date: Date) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + diff);
  return target;
}

function getWeekEndExclusive(weekStart: Date) {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);
  return next;
}

function normalizeWeeklyGoal(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatDurationShort(totalMinutes: number, language: "de" | "en") {
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

function normalizeExerciseLookupName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeMuscleName(value: string) {
  return value
    .toLowerCase()
    .replace(/muskulatur/g, "")
    .replace(/musculature/g, "")
    .trim();
}

function resolveMuscleGroup(muscleName: string): MuscleGroupKey | null {
  const name = normalizeMuscleName(muscleName);
  if (!name) return null;

  if (
    /(bizeps|biceps|trizeps|triceps|unterarm|forearm|brachialis|brachioradialis)/.test(name)
  ) {
    return "arms";
  }
  if (
    /(brust|chest|pec|pectoral)/.test(name)
  ) {
    return "chest";
  }
  if (
    /(schulter|shoulder|deltoid|delt|rotatorenmanschette|rotator cuff|supraspinatus|infraspinatus)/.test(name)
  ) {
    return "shoulders";
  }
  if (
    /(rücken|back|lat|lats|latissimus|rhomboid|trapez|trapezius|trap|teres|erector spinae|spinal erector)/.test(name)
  ) {
    return "back";
  }
  if (
    /(bauch|core|abs|abdom|oblique|obliques|transversus|serratus)/.test(name)
  ) {
    return "core";
  }
  if (
    /(bein|leg|quad|quadriceps|hamstring|glute|gluteus|adductor|abductor|calf|calves|wade)/.test(name)
  ) {
    return "legs";
  }

  return null;
}

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
    return undefined;
  }
  return templateAiInfoByWorkoutAndName.get(`${workoutId}::${exerciseNameKey}`);
}

function addMuscleContributionFromSet(
  set: SessionExerciseSet,
  metrics: WeeklyMuscleGroupMetrics,
  templateAiInfoById: Map<number, ExerciseAiInfo>,
  templateAiInfoByWorkoutAndName: Map<string, ExerciseAiInfo>,
  sessionWorkoutIdBySessionId: Map<number, number>
) {
  const aiInfo = getSetAiInfo(set, templateAiInfoById, templateAiInfoByWorkoutAndName, sessionWorkoutIdBySessionId);
  if (!aiInfo?.targetMuscles?.length) {
    return;
  }

  const groupPercentByKey = new Map<MuscleGroupKey, number>();
  for (const target of aiInfo.targetMuscles) {
    const group = resolveMuscleGroup(target.muscle);
    if (!group) continue;
    const percent = clampPercent(Number(target.involvementPercent));
    if (!Number.isFinite(percent) || percent <= 0) continue;
    groupPercentByKey.set(group, (groupPercentByKey.get(group) ?? 0) + percent);
  }

  const totalPercent = [...groupPercentByKey.values()].reduce((sum, value) => sum + value, 0);
  if (totalPercent <= 0) {
    return;
  }

  const setMultiplier = getSetStatsMultiplier(set);
  const repsBase = (set.actualReps ?? set.targetReps) * setMultiplier;
  const weightBase = (set.actualWeight ?? set.targetWeight) * (set.actualReps ?? set.targetReps) * setMultiplier;

  for (const [group, percent] of groupPercentByKey.entries()) {
    const factor = percent / totalPercent;
    metrics[group].sets += setMultiplier * factor;
    metrics[group].reps += repsBase * factor;
    metrics[group].weight += weightBase * factor;
  }
}

function getMuscleMetricValue(metrics: WeeklyMuscleGroupMetrics, group: MuscleGroupKey, mode: MuscleMetricMode) {
  return metrics[group][mode];
}

function formatMuscleMetricValue(value: number, mode: MuscleMetricMode) {
  const digits = mode === "sets" ? 1 : 0;
  return formatNumber(value, digits);
}

function getDistance(a: RadarPoint, b: RadarPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function buildRoundedRadarPath(points: RadarPoint[], cornerRadius = 2.5) {
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

    const start: RadarPoint = {
      x: point.x + ((prev.x - point.x) * radius) / prevDistance,
      y: point.y + ((prev.y - point.y) * radius) / prevDistance
    };
    const end: RadarPoint = {
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

function getMuscleGroupLabel(
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

function PlayFilledIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 6v12l10-6z" fill="currentColor" />
    </svg>
  );
}

export function DashboardPage() {
  return <DashboardPageContent section="workouts" />;
}

export function StatisticsPage() {
  return <DashboardPageContent section="statistics" />;
}

function DashboardPageContent({ section }: { section: "workouts" | "statistics" }) {
  const { t, language, weightUnit } = useSettings();
  const navigate = useNavigate();
  const [clockTick, setClockTick] = useState(() => Date.now());
  const weekStart = useMemo(() => getWeekStart(new Date(clockTick)), [clockTick]);
  const [discardConfirmSessionId, setDiscardConfirmSessionId] = useState<number | null>(null);
  const [isCreatingStarterWorkout, setIsCreatingStarterWorkout] = useState(false);
  const [muscleMetricMode, setMuscleMetricMode] = useState<MuscleMetricMode>("reps");

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const workouts = useLiveQuery(async () => {
    const list = await db.workouts.toArray();
    const workoutIds = list.map((workout) => workout.id).filter((id): id is number => !!id);

    const [exercises, sessions] = await Promise.all([
      workoutIds.length
        ? db.exercises
            .where("workoutId")
            .anyOf(workoutIds)
            .and((exercise) => exercise.isTemplate !== false)
            .toArray()
        : [],
      workoutIds.length ? db.sessions.where("workoutId").anyOf(workoutIds).toArray() : []
    ]);

    const exerciseCountByWorkout = new Map<number, number>();
    for (const exercise of exercises) {
      exerciseCountByWorkout.set(exercise.workoutId, (exerciseCountByWorkout.get(exercise.workoutId) ?? 0) + 1);
    }

    const lastSessionByWorkout = new Map<number, string>();
    const activeSessions = sessions
      .filter((session): session is typeof session & { id: number } => session.status === "active" && session.id !== undefined)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const primaryActiveSession = activeSessions[0];
    const primaryActiveSessionId = primaryActiveSession?.id;
    const activeSessionByWorkout = new Map<number, { id: number; startedAt: string }>();

    for (const session of sessions) {
      if (
        primaryActiveSessionId !== undefined &&
        session.status === "active" &&
        session.id === primaryActiveSessionId
      ) {
        activeSessionByWorkout.set(session.workoutId, {
          id: primaryActiveSessionId,
          startedAt: session.startedAt
        });
      }

      if (session.status === "completed") {
        const timestamp = session.finishedAt ?? session.startedAt;
        const existing = lastSessionByWorkout.get(session.workoutId);
        if (!existing || new Date(timestamp).getTime() > new Date(existing).getTime()) {
          lastSessionByWorkout.set(session.workoutId, timestamp);
        }
      }
    }

    return list.map<WorkoutListItem>((workout) => {
      const lastSessionAt = workout.id ? lastSessionByWorkout.get(workout.id) : undefined;
      const activeSession = workout.id ? activeSessionByWorkout.get(workout.id) : undefined;

      return {
        ...workout,
        exerciseCount: exerciseCountByWorkout.get(workout.id ?? -1) ?? 0,
        lastSessionAt,
        activeSessionId: activeSession?.id,
        activeSessionStartedAt: activeSession?.startedAt,
        sortTimestamp: lastSessionAt ? new Date(lastSessionAt).getTime() : -Infinity
      };
    });
  }, []);

  const weeklyStats = useLiveQuery<WeeklyDashboardStats>(async () => {
    const weekEndExclusive = getWeekEndExclusive(weekStart);
    const settings = await db.settings.get(1);
    const weeklyWeightGoal = normalizeWeeklyGoal(settings?.weeklyWeightGoal);
    const weeklyCaloriesGoal = normalizeWeeklyGoal(settings?.weeklyCaloriesGoal);
    const weeklyWorkoutCountGoal = normalizeWeeklyGoal(settings?.weeklyWorkoutCountGoal);
    const weeklyDurationGoal = normalizeWeeklyGoal(settings?.weeklyDurationGoal);
    const completedSessions = (await db.sessions.where("status").equals("completed").toArray())
      .filter((session) => {
        const completedAt = new Date(session.finishedAt ?? session.startedAt);
        return completedAt >= weekStart && completedAt < weekEndExclusive;
      })
      .sort(
        (a, b) =>
          new Date(a.finishedAt ?? a.startedAt).getTime() - new Date(b.finishedAt ?? b.startedAt).getTime()
      );

    if (completedSessions.length === 0) {
      return {
        ...EMPTY_WEEKLY_STATS,
        weeklyWeightGoal,
        weeklyCaloriesGoal,
        weeklyWorkoutCountGoal,
        weeklyDurationGoal
      };
    }

    const sessionIds = completedSessions.map((session) => session.id).filter((id): id is number => id !== undefined);
    const workoutIds = [...new Set(completedSessions.map((session) => session.workoutId))];

    const [allSets, workoutsForStats, templateExercisesForWorkouts] = await Promise.all([
      sessionIds.length ? db.sessionExerciseSets.where("sessionId").anyOf(sessionIds).toArray() : [],
      workoutIds.length ? db.workouts.where("id").anyOf(workoutIds).toArray() : [],
      workoutIds.length
        ? db.exercises
            .where("workoutId")
            .anyOf(workoutIds)
            .and((exercise) => exercise.isTemplate !== false)
            .toArray()
        : []
    ]);

    const templateExerciseIds = [...new Set(allSets.map((set) => set.templateExerciseId).filter((id): id is number => id !== undefined))];
    const templateExercises = templateExerciseIds.length
      ? await db.exercises.where("id").anyOf(templateExerciseIds).toArray()
      : [];
    const templateAiInfoById = new Map<number, ExerciseAiInfo>();
    for (const exercise of templateExercises) {
      if (exercise.id !== undefined && exercise.aiInfo) {
        templateAiInfoById.set(exercise.id, exercise.aiInfo);
      }
    }
    const templateAiInfoByWorkoutAndName = new Map<string, ExerciseAiInfo>();
    for (const exercise of templateExercisesForWorkouts) {
      if (!exercise.aiInfo) continue;
      const nameKey = normalizeExerciseLookupName(exercise.name);
      if (!nameKey) continue;
      templateAiInfoByWorkoutAndName.set(`${exercise.workoutId}::${nameKey}`, exercise.aiInfo);
    }

    const setsBySessionId = new Map<number, SessionExerciseSet[]>();
    for (const set of allSets) {
      const current = setsBySessionId.get(set.sessionId) ?? [];
      current.push(set);
      setsBySessionId.set(set.sessionId, current);
    }

    const workoutNameById = new Map<number, string>();
    for (const workout of workoutsForStats) {
      if (workout.id !== undefined) {
        workoutNameById.set(workout.id, workout.name);
      }
    }
    const sessionWorkoutIdBySessionId = new Map<number, number>();
    for (const session of completedSessions) {
      if (session.id !== undefined) {
        sessionWorkoutIdBySessionId.set(session.id, session.workoutId);
      }
    }

    const weekdayFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      weekday: "long"
    });

    let durationMinutesTotal = 0;
    let setCount = 0;
    let repsTotal = 0;
    let totalWeight = 0;
    let caloriesTotal = 0;
    const muscleGroupMetrics = createEmptyMuscleGroupMetrics();
    const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);

    const completedWorkouts = completedSessions.map((session) => {
      const sessionId = session.id ?? -1;
      const sessionSets = setsBySessionId.get(sessionId) ?? [];
      const completedSets = sessionSets.filter((set) => set.completed);
      const weightedCompletedSetCount = completedSets.reduce((sum, set) => sum + getSetStatsMultiplier(set), 0);
      const sessionRepsTotal = completedSets.reduce(
        (sum, set) => sum + (set.actualReps ?? set.targetReps) * getSetStatsMultiplier(set),
        0
      );
      const sessionTotalWeight = completedSets.reduce(
        (sum, set) =>
          sum +
          (set.actualWeight ?? set.targetWeight) *
            (set.actualReps ?? set.targetReps) *
            getSetStatsMultiplier(set),
        0
      );

      setCount += weightedCompletedSetCount;
      repsTotal += sessionRepsTotal;
      totalWeight += sessionTotalWeight;
      for (const completedSet of completedSets) {
        addMuscleContributionFromSet(
          completedSet,
          muscleGroupMetrics,
          templateAiInfoById,
          templateAiInfoByWorkoutAndName,
          sessionWorkoutIdBySessionId
        );
      }

      const durationMinutes = getSessionDurationMinutes(session.startedAt, session.finishedAt);
      durationMinutesTotal += durationMinutes;
      caloriesTotal += estimateStrengthTrainingCalories({
        durationMinutes,
        bodyWeightKg,
        completedSetCount: weightedCompletedSetCount,
        repsTotal: sessionRepsTotal
      });

      const completedAt = new Date(session.finishedAt ?? session.startedAt);
      const startedAtDate = new Date(session.startedAt);
      const finishedAtDate = new Date(session.finishedAt ?? session.startedAt);
      const midpointAt = new Date((startedAtDate.getTime() + finishedAtDate.getTime()) / 2);
      return {
        sessionId,
        workoutId: session.workoutId,
        workoutName: workoutNameById.get(session.workoutId) ?? "-",
        weekdayLabel: weekdayFormatter.format(completedAt),
        startedAt: session.startedAt,
        finishedAt: session.finishedAt ?? null,
        midpointAt: midpointAt.toISOString()
      };
    });

    return {
      workoutCount: completedSessions.length,
      durationMinutesTotal,
      setCount,
      repsTotal,
      totalWeight,
      caloriesTotal,
      usesDefaultBodyWeightForCalories: usesDefaultBodyWeight,
      completedWorkouts,
      weeklyWeightGoal,
      weeklyCaloriesGoal,
      weeklyWorkoutCountGoal,
      weeklyDurationGoal,
      muscleGroupMetrics
    };
  }, [language, weekStart.getTime(), weightUnit]);

  const { activeWorkouts, inactiveWorkouts } = useMemo(() => {
    const active = (workouts ?? [])
      .filter((workout) => !!workout.activeSessionId)
      .sort((a, b) => new Date(a.activeSessionStartedAt ?? 0).getTime() - new Date(b.activeSessionStartedAt ?? 0).getTime());

    const inactive = (workouts ?? [])
      .filter((workout) => !workout.activeSessionId)
      .sort((a, b) => {
        if (a.sortTimestamp !== b.sortTimestamp) {
          return a.sortTimestamp - b.sortTimestamp;
        }
        return a.name.localeCompare(b.name);
      });

    return { activeWorkouts: active, inactiveWorkouts: inactive };
  }, [workouts]);

  const hasWorkouts = useMemo(() => (workouts?.length ?? 0) > 0, [workouts]);
  const showWorkoutsSection = section === "workouts";
  const showStatsSection = section === "statistics";
  const hasActiveWorkout = activeWorkouts.length > 0;
  const weeklyGoalItems = useMemo(() => {
    if (!weeklyStats) {
      return [];
    }

    const formatWithUnit = (value: number, unitLabel?: string) => {
      const base = formatNumber(value, 0);
      return unitLabel ? `${base} ${unitLabel}` : base;
    };

    const items: Array<{
      key: "workouts" | "duration" | "calories" | "weight";
      label: string;
      currentLabel: string;
      targetLabel: string;
      progressPercent: number;
      isComplete: boolean;
      icon: React.ReactNode;
    }> = [];

    if (weeklyStats.weeklyWorkoutCountGoal) {
      const current = weeklyStats.workoutCount;
      const target = weeklyStats.weeklyWorkoutCountGoal;
      items.push({
        key: "workouts",
        label: t("workouts"),
        currentLabel: formatWithUnit(current),
        targetLabel: formatWithUnit(target),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Dumbbell className="h-3.5 w-3.5" />
      });
    }

    if (weeklyStats.weeklyDurationGoal) {
      const current = weeklyStats.durationMinutesTotal;
      const target = weeklyStats.weeklyDurationGoal;
      items.push({
        key: "duration",
        label: t("duration"),
        currentLabel: formatDurationShort(current, language),
        targetLabel: formatDurationShort(target, language),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Clock3 className="h-3.5 w-3.5" />
      });
    }

    if (weeklyStats.weeklyCaloriesGoal) {
      const current = weeklyStats.caloriesTotal ?? 0;
      const target = weeklyStats.weeklyCaloriesGoal;
      items.push({
        key: "calories",
        label: t("calories"),
        currentLabel: formatWithUnit(current, "kcal"),
        targetLabel: formatWithUnit(target, "kcal"),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Flame className="h-3.5 w-3.5" />
      });
    }

    if (weeklyStats.weeklyWeightGoal) {
      const current = weeklyStats.totalWeight;
      const target = weeklyStats.weeklyWeightGoal;
      items.push({
        key: "weight",
        label: t("totalWeight"),
        currentLabel: formatWithUnit(current, weightUnit),
        targetLabel: formatWithUnit(target, weightUnit),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Weight className="h-3.5 w-3.5" />
      });
    }

    return items;
  }, [weeklyStats, t, weightUnit, language]);

  const weeklyMuscleChart = useMemo(() => {
    const metrics = weeklyStats?.muscleGroupMetrics ?? EMPTY_WEEKLY_STATS.muscleGroupMetrics;
    const items = MUSCLE_GROUP_ORDER.map((key) => ({
      key,
      label: getMuscleGroupLabel(t, key),
      value: getMuscleMetricValue(metrics, key, muscleMetricMode)
    }));
    const maxValue = Math.max(0, ...items.map((item) => item.value));
    const totalValue = items.reduce((sum, item) => sum + item.value, 0);
    return { items, maxValue, totalValue };
  }, [weeklyStats?.muscleGroupMetrics, t, muscleMetricMode]);

  const weeklySessionsTimeline = useMemo(() => {
    const weekStartMs = weekStart.getTime();
    const weekEndMs = getWeekEndExclusive(weekStart).getTime();
    const totalSpanMs = Math.max(1, weekEndMs - weekStartMs);
    const weekdayFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { weekday: "short" });
    const timeFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const dayLabels = Array.from({ length: 7 }).map((_, dayIndex) => {
      const dayDate = new Date(weekStartMs + dayIndex * 86_400_000);
      const raw = weekdayFormatter.format(dayDate).replace(/\.$/, "");
      return {
        key: dayIndex,
        label: raw,
        leftPercent: ((dayIndex + 0.5) / 7) * 100
      };
    });

    const ticks = Array.from({ length: 29 }).map((_, tickIndex) => ({
      key: tickIndex,
      leftPercent: (tickIndex / 28) * 100,
      isDayBoundary: tickIndex % 4 === 0
    }));

    const items = (weeklyStats?.completedWorkouts ?? []).map((item) => {
      const midpointMs = new Date(item.midpointAt).getTime();
      const clampedMidpointMs = Math.max(weekStartMs, Math.min(weekEndMs, midpointMs));
      const rawLeftPercent = ((clampedMidpointMs - weekStartMs) / totalSpanMs) * 100;
      const leftPercent = Math.max(1.5, Math.min(98.5, rawLeftPercent));
      const startLabel = timeFormatter.format(new Date(item.startedAt));
      const endLabel = timeFormatter.format(new Date(item.finishedAt ?? item.startedAt));
      const durationMinutes = Math.round(getSessionDurationMinutes(item.startedAt, item.finishedAt ?? item.startedAt));

      return {
        ...item,
        leftPercent,
        shortLabel: item.workoutName.trim(),
        metaLabel: `${Math.max(0, durationMinutes)} min`,
        title: `${item.workoutName} • ${item.weekdayLabel} • ${startLabel}–${endLabel}`
      };
    });

    return { dayLabels, ticks, items };
  }, [language, weekStart, weeklyStats?.completedWorkouts]);

  const handleStartSession = async (workoutId: number) => {
    try {
      const sessionId = await startSession(workoutId);
      navigate(`/sessions/${sessionId}`);
    } catch {
      toast.error("Session start failed");
    }
  };

  const handleDiscardConfirmed = async () => {
    if (!discardConfirmSessionId) return;
    try {
      await discardSession(discardConfirmSessionId);
      toast.success(t("sessionDiscarded"));
    } catch {
      toast.error("Action failed");
    } finally {
      setDiscardConfirmSessionId(null);
    }
  };

  const handleUseStarterWorkout = async () => {
    try {
      setIsCreatingStarterWorkout(true);
      await ensureDefaultWorkout();
      toast.success(t("workoutCreated"));
    } catch {
      toast.error("Action failed");
    } finally {
      setIsCreatingStarterWorkout(false);
    }
  };

  const renderWorkoutCard = (workout: WorkoutListItem) => {
    const isActive = !!workout.activeSessionId;
    const disableStartBecauseOtherActive = hasActiveWorkout && !isActive;

    return (
      <Card key={workout.id}>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>{workout.name}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {workout.exerciseCount} {t("exercises")}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            {isActive ? (
              <>
                <span className={ACTIVE_SESSION_PILL_CLASS}>
                  {t("activeSession")}
                </span>
                <p className="pr-2 text-xs text-muted-foreground">
                  {t("since")}{" "}
                  {workout.activeSessionStartedAt ? formatSessionDateLabel(workout.activeSessionStartedAt, language) : "-"}
                </p>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                <p>{t("lastSession")}</p>
                <p>{workout.lastSessionAt ? formatSessionDateLabel(workout.lastSessionAt, language) : "-"}</p>
              </div>
            )}
          </div>
        </CardHeader>

        <CardFooter className="justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("sessionHistory")}
              onClick={() => navigate(`/workouts/${workout.id}/history`)}
            >
              <ChartNoAxesCombined className="h-4 w-4" />
            </Button>
            {!isActive && (
              <Button
                variant="outline"
                size="icon"
                aria-label={t("edit")}
                onClick={() => navigate(`/workouts/${workout.id}/edit`)}
              >
                <PenSquare className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <Button
                variant="outline"
                size="icon"
                aria-label={t("discardSession")}
                onClick={() => {
                  if (workout.activeSessionId) {
                    setDiscardConfirmSessionId(workout.activeSessionId);
                  }
                }}
              >
                <OctagonX className="h-4 w-4" />
              </Button>
            )}
            <Button
              className={isActive ? "bg-emerald-500 text-emerald-50 hover:bg-emerald-500/90 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900" : undefined}
              disabled={disableStartBecauseOtherActive}
              onClick={() => handleStartSession(workout.id!)}
            >
              <PlayFilledIcon className={`mr-2 shrink-0 ${isActive ? "h-[1.375rem] w-[1.375rem]" : "h-[1.125rem] w-[1.125rem]"}`} />
              {isActive ? t("resumeSession") : t("startSession")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    );
  };

  return (
    <section className="space-y-4">
      {showWorkoutsSection && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold leading-tight text-foreground/75">{t("workoutsSubtitle")}</p>
          {hasWorkouts && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("/workouts/add")}
            >
              <Plus className="h-4 w-4" />
              {t("add")}
            </Button>
          )}
        </div>
      )}

      {showWorkoutsSection && !hasWorkouts && (
        <>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>{t("dashboardIntroTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("dashboardIntroDescription")}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="secondary"
              className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
              disabled={isCreatingStarterWorkout}
              onClick={() => void handleUseStarterWorkout()}
            >
              <Dumbbell className="h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start">
                <span>{t("useStarterWorkout")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("useStarterWorkoutHint")}</span>
              </span>
            </Button>
            <Button
              variant="secondary"
              className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
              onClick={() => navigate("/workouts/new")}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start">
                <span>{t("createWorkout")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("createWorkoutHint")}</span>
              </span>
            </Button>
            <Button
              variant="secondary"
              className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
              onClick={() => navigate("/import")}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start">
                <span>{t("aiGenerate")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("aiImportEntryHint")}</span>
              </span>
            </Button>
          </CardContent>
        </Card>
        <div className="border-t p-4">
          <p className="mb-2 text-xs text-muted-foreground">{t("dashboardImportExistingDataHint")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => navigate("/settings#data-import")}
          >
            <Download className="h-4 w-4" />
            {t("dashboardImportExistingData")}
          </Button>
        </div>
        </>
      )}

      {showWorkoutsSection && activeWorkouts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t("activeSession")}</p>
          {activeWorkouts.map(renderWorkoutCard)}
        </div>
      )}

      {showWorkoutsSection && activeWorkouts.length > 0 && inactiveWorkouts.length > 0 && <div className="h-px bg-border" />}

      {showWorkoutsSection && inactiveWorkouts.length > 0 && (
        <div className="space-y-3">
          {activeWorkouts.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">{t("otherWorkouts")}</p>
          )}
          {inactiveWorkouts.map(renderWorkoutCard)}
        </div>
      )}

      {showStatsSection && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Dumbbell className="h-3.5 w-3.5" />
                {t("workoutsThisWeek")}
              </p>
              <p className="text-base font-semibold">{weeklyStats?.workoutCount ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {t("duration")}
              </p>
              <p className="text-base font-semibold">{formatDurationShort(weeklyStats?.durationMinutesTotal ?? 0, language)}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                {t("sets")}
              </p>
              <p className="text-base font-semibold">{weeklyStats?.setCount ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" />
                {t("repsTotal")}
              </p>
              <p className="text-base font-semibold">{weeklyStats?.repsTotal ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Weight className="h-3.5 w-3.5" />
                {t("totalWeight")}
              </p>
              <p className="text-base font-semibold">
                {formatNumber(weeklyStats?.totalWeight ?? 0, 0)} {weightUnit}
              </p>
            </div>
            <div className="relative rounded-lg border bg-card px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Flame className="h-3.5 w-3.5" />
                  {t("calories")}
                </p>
                {weeklyStats?.usesDefaultBodyWeightForCalories && (
                  <InfoHint
                    ariaLabel={t("calories")}
                    text={t("caloriesEstimateAverageHint")}
                    className="-mr-1 -mt-0.5 shrink-0"
                  />
                )}
              </div>
              <p className="text-base font-semibold">
                ~{formatNumber(weeklyStats?.caloriesTotal ?? 0, 0)} kcal
              </p>
            </div>
          </div>

          <div className="py-3">
            <div className="h-px bg-border" />
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                {t("sessions")}
              </p>
            </div>
            {(weeklyStats?.completedWorkouts.length ?? 0) > 0 ? (
              <div className="relative h-34 px-1 pt-4">
                <div className="relative h-28">
                  <div className="absolute inset-x-0 bottom-3 h-px bg-border" />

                  {weeklySessionsTimeline.ticks.map((tick) => (
                    <div
                      key={`session-tick-${tick.key}`}
                      className="absolute bottom-3 -translate-x-1/2"
                      style={{ left: `${tick.leftPercent}%` }}
                      aria-hidden="true"
                    >
                      <div className={`w-px bg-border ${tick.isDayBoundary ? "h-3.5" : "h-[7px] opacity-80"}`} />
                    </div>
                  ))}

                  {weeklySessionsTimeline.items.map((item) => (
                    <Link
                      key={item.sessionId}
                      to={`/workouts/${item.workoutId}/history#session-${item.sessionId}`}
                      title={item.title}
                      className="group absolute bottom-4 -translate-x-1/2"
                      style={{ left: `${item.leftPercent}%` }}
                    >
                      <div className="relative inline-flex h-[6rem] w-[2rem] items-center justify-center rounded-md border bg-card px-3 py-3 shadow-sm transition-colors group-hover:bg-secondary">
                        <div className="absolute left-1/2 top-1/2 w-[5rem] -translate-x-1/2 -translate-y-1/2 -rotate-90 overflow-hidden">
                          <span className="block truncate text-center font-sans text-[12px] font-medium leading-none text-foreground">
                            {item.shortLabel}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="relative -mt-1 h-3">
                  {weeklySessionsTimeline.dayLabels.map((day) => (
                    <div
                      key={`session-day-${day.key}`}
                      className="absolute top-0 -translate-x-1/2 text-[10px] font-medium leading-none text-muted-foreground"
                      style={{ left: `${day.leftPercent}%` }}
                    >
                      {day.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-1 py-1">
                <p className="text-sm text-muted-foreground">{t("noWorkoutsThisWeek")}</p>
              </div>
            )}
          </section>

          <div className="py-3">
            <div className="h-px bg-border" />
          </div>

          {weeklyGoalItems.length > 0 && (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                    {t("weeklyGoals")}
                  </p>
                  <Button asChild variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs">
                    <Link to="/settings#weekly-goals">
                      <PenSquare className="h-3 w-3" />
                      {t("edit")}
                    </Link>
                  </Button>
                </div>
                <div className="space-y-2">
                  {weeklyGoalItems.map((goal) => (
                    <div key={goal.key} className="rounded-md border bg-card px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {goal.icon}
                          {goal.label}
                        </p>
                        <p className="text-xs font-medium tabular-nums">
                          {goal.currentLabel} / {goal.targetLabel}
                        </p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all ${goal.isComplete ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${goal.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="py-3">
                <div className="h-px bg-border" />
              </div>
            </>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                {t("muscleGroupsThisWeek")}
              </p>
              <div className="inline-flex items-center rounded-lg border bg-background p-0.5">
                {(["reps", "sets", "weight"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMuscleMetricMode(mode)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      muscleMetricMode === mode
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={muscleMetricMode === mode}
                  >
                    {mode === "reps" ? t("muscleMetricReps") : mode === "sets" ? t("muscleMetricSets") : t("muscleMetricWeight")}
                  </button>
                ))}
              </div>
            </div>

            <Card>
              <CardContent className="space-y-0 px-4 py-0">
                {weeklyMuscleChart.totalValue > 0 ? (
                  <div className="mx-auto w-full max-w-[420px]">
                    <svg viewBox="0 0 360 360" className="block h-auto w-full" role="img" aria-label={t("muscleGroupsThisWeek")}>
                        {Array.from({ length: 5 }).map((_, ringIndex) => {
                          const radius = 28 + ringIndex * 22;
                          return (
                            <circle
                              key={`ring-${radius}`}
                              cx="180"
                              cy="180"
                              r={radius}
                              fill="none"
                              stroke="currentColor"
                              className="text-border/70"
                              strokeWidth="1"
                            />
                          );
                        })}

                        {weeklyMuscleChart.items.map((item, index) => {
                          const angle = (-120 + index * 60) * (Math.PI / 180);
                          const axisX = 180 + Math.cos(angle) * 116;
                          const axisY = 180 + Math.sin(angle) * 116;
                          const labelX = 180 + Math.cos(angle) * 148;
                          const labelY = 180 + Math.sin(angle) * 148;
                          const textAnchor =
                            Math.cos(angle) > 0.2 ? "start" : Math.cos(angle) < -0.2 ? "end" : "middle";
                          const valueY = labelY + (Math.sin(angle) > 0.3 ? 18 : Math.sin(angle) < -0.3 ? 20 : 18);

                          return (
                            <g key={`axis-${item.key}`}>
                              <line
                                x1="180"
                                y1="180"
                                x2={axisX}
                                y2={axisY}
                                stroke="currentColor"
                                className="text-border"
                                strokeWidth="1"
                              />
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor={textAnchor}
                                className="fill-foreground text-[12px] font-medium"
                              >
                                {item.label}
                              </text>
                              <text
                                x={labelX}
                                y={valueY}
                                textAnchor={textAnchor}
                                className="fill-muted-foreground text-[11px]"
                              >
                                {formatMuscleMetricValue(item.value, muscleMetricMode)}
                              </text>
                            </g>
                          );
                        })}

                        {(() => {
                          const points: RadarPoint[] = weeklyMuscleChart.items.map((item, index) => {
                            const angle = (-120 + index * 60) * (Math.PI / 180);
                            const ratio = weeklyMuscleChart.maxValue > 0 ? item.value / weeklyMuscleChart.maxValue : 0;
                            const radius = 28 + ratio * 88;
                            const x = 180 + Math.cos(angle) * radius;
                            const y = 180 + Math.sin(angle) * radius;
                            return { x, y };
                          });
                          const path = buildRoundedRadarPath(points, 2.5);

                          return (
                            <>
                              <path
                                d={path}
                                fill="currentColor"
                                className="text-primary/15"
                                stroke="none"
                              />
                              <path
                                d={path}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-primary"
                              />
                            </>
                          );
                        })()}
                    </svg>
                  </div>
                ) : (
                  <div className="rounded-md border bg-background px-3 py-3">
                    <p className="text-sm text-muted-foreground">{t("noMuscleDataThisWeek")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("noMuscleDataThisWeekHint")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </section>
      )}

      <Dialog open={discardConfirmSessionId !== null} onOpenChange={(open) => !open && setDiscardConfirmSessionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discardSession")}</DialogTitle>
            <DialogDescription>{t("discardSessionConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardConfirmSessionId(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={() => void handleDiscardConfirmed()}
            >
              {t("discardSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
