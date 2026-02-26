import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { ExerciseAiInfo, SessionExerciseSet, WeightUnit } from "@/db/types";
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import { getEffectiveSetWeight, getSetStatsMultiplier } from "@/lib/utils";
import type { WorkoutListItem } from "@/features/dashboard/dashboard-page-cards";
import {
  addMuscleContributionFromSet,
  createEmptyMuscleGroupMetrics,
  EMPTY_WEEKLY_STATS,
  getWeekEndExclusive,
  normalizeExerciseLookupName,
  normalizeWeeklyGoal,
  type WeeklyDashboardStats
} from "@/features/statistics/weekly-data-utils";

function estimateWorkoutDurationMinutes(params: {
  restSeconds: number;
  exercises: Array<{ x2Enabled?: boolean; setTargetReps: number[] }>;
}) {
  const repSecondsPerRep = 3;
  let totalWeightedSets = 0;
  let totalWeightedReps = 0;
  let exercisesWithSets = 0;

  for (const exercise of params.exercises) {
    if (exercise.setTargetReps.length === 0) continue;
    exercisesWithSets += 1;
    const multiplier = getSetStatsMultiplier({ x2Enabled: exercise.x2Enabled });
    totalWeightedSets += exercise.setTargetReps.length * multiplier;
    totalWeightedReps += exercise.setTargetReps.reduce((sum, reps) => sum + Math.max(0, reps), 0) * multiplier;
  }

  if (totalWeightedSets <= 0) return 0;

  const restIntervalCount = Math.max(0, totalWeightedSets - 1) + Math.max(0, exercisesWithSets - 1);
  const totalSeconds = totalWeightedReps * repSecondsPerRep + restIntervalCount * Math.max(0, params.restSeconds);
  const roundedMinutes = Math.round(totalSeconds / 300) * 5;
  return Math.max(5, roundedMinutes);
}

export function useDashboardWorkoutsData(params: { restTimerEnabled: boolean; restTimerSeconds: number }) {
  const { restTimerEnabled, restTimerSeconds } = params;

  return useLiveQuery(async () => {
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

    const exerciseIds = exercises.map((exercise) => exercise.id).filter((id): id is number => id !== undefined);
    const templateSets = exerciseIds.length
      ? await db.exerciseTemplateSets.where("exerciseId").anyOf(exerciseIds).toArray()
      : [];

    const exerciseCountByWorkout = new Map<number, number>();
    const templateExercisesByWorkout = new Map<number, Array<{ id: number; x2Enabled?: boolean }>>();
    for (const exercise of exercises) {
      exerciseCountByWorkout.set(exercise.workoutId, (exerciseCountByWorkout.get(exercise.workoutId) ?? 0) + 1);
      if (exercise.id !== undefined) {
        const current = templateExercisesByWorkout.get(exercise.workoutId) ?? [];
        current.push({ id: exercise.id, x2Enabled: exercise.x2Enabled });
        templateExercisesByWorkout.set(exercise.workoutId, current);
      }
    }
    for (const entry of templateExercisesByWorkout.values()) {
      entry.sort((a, b) => a.id - b.id);
    }

    const setTargetRepsByExerciseId = new Map<number, number[]>();
    for (const set of templateSets) {
      const current = setTargetRepsByExerciseId.get(set.exerciseId) ?? [];
      current.push(set.targetReps);
      setTargetRepsByExerciseId.set(set.exerciseId, current);
    }

    const estimatedDurationMinutesByWorkout = new Map<number, number>();
    const effectiveRestSeconds = restTimerEnabled ? restTimerSeconds : 180;
    for (const [workoutId, workoutExercises] of templateExercisesByWorkout.entries()) {
      const durationMinutes = estimateWorkoutDurationMinutes({
        restSeconds: effectiveRestSeconds,
        exercises: workoutExercises.map((exercise) => ({
          x2Enabled: exercise.x2Enabled,
          setTargetReps: setTargetRepsByExerciseId.get(exercise.id) ?? []
        }))
      });
      estimatedDurationMinutesByWorkout.set(workoutId, durationMinutes);
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
        estimatedDurationMinutes: estimatedDurationMinutesByWorkout.get(workout.id ?? -1) ?? 0,
        lastSessionAt,
        activeSessionId: activeSession?.id,
        activeSessionStartedAt: activeSession?.startedAt,
        sortTimestamp: lastSessionAt ? new Date(lastSessionAt).getTime() : -Infinity
      };
    });
  }, [restTimerEnabled, restTimerSeconds]);
}

export function useWeeklyStatsData(params: {
  language: string;
  weightUnit: WeightUnit;
  weekStart: Date;
}) {
  const { language, weightUnit, weekStart } = params;

  return useLiveQuery<WeeklyDashboardStats>(async () => {
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

    const templateExerciseIds = [
      ...new Set(allSets.map((set) => set.templateExerciseId).filter((id): id is number => id !== undefined))
    ];
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
          getEffectiveSetWeight(set.actualWeight ?? set.targetWeight, bodyWeightKg) *
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
}
