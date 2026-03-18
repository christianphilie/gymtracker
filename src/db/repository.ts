import { db } from "@/db/db";
import type {
  AppLanguage,
  Exercise,
  ExerciseTemplateSet,
  PreviousSessionSummary,
  Session,
  SessionExerciseSet,
  Settings,
  WeightUnit,
  Workout,
  WorkoutScheduleDay,
  WorkoutWithRelations
} from "@/db/types";
import { importAllDataSnapshot } from "@/db/repository-backup";
import { ensureDefaultSettings } from "@/db/repository-settings";
import {
  buildExerciseAiInfoForCatalogMatch,
  matchExerciseCatalogEntry
} from "@/lib/exercise-catalog";
import { normalizeWorkoutScheduledDays } from "@/lib/workout-schedule";
import { normalizeSessionExerciseSet } from "@/lib/utils";

export {
  ensureDefaultSettings,
  getSettings,
  updateColorScheme,
  updateLockerNoteEnabled,
  updateLockerNumber,
  updateRestTimerEnabled,
  updateRestTimerSeconds,
  updateSettings,
  updateWeekStartsOn,
  updateWeightUnitAndConvert
} from "@/db/repository-settings";
export type { AppDataSnapshot } from "@/db/repository-backup";
export {
  clearAllData,
  createUpdateSafetySnapshotIfNeeded,
  exportAllDataSnapshot,
  getLatestUpdateSafetySnapshot,
  importAllDataSnapshot,
  restoreUpdateSafetySnapshot
} from "@/db/repository-backup";

function normalizeExerciseWeightValue(weight: number, negativeWeightEnabled?: boolean) {
  if (weight === 0) {
    return 0;
  }
  return negativeWeightEnabled ? -Math.abs(weight) : weight;
}

function normalizeTemplateExerciseRelation(
  exercise: Exercise,
  sets: ExerciseTemplateSet[]
): { exercise: Exercise; sets: ExerciseTemplateSet[] } {
  const negativeWeightEnabled =
    exercise.negativeWeightEnabled === true || sets.some((set) => set.targetWeight < 0);

  if (!negativeWeightEnabled) {
    return { exercise, sets };
  }

  return {
    exercise: {
      ...exercise,
      negativeWeightEnabled: true
    },
    sets: sets.map((set) => ({
      ...set,
      targetWeight: normalizeExerciseWeightValue(set.targetWeight, true)
    }))
  };
}

interface WorkoutDraft {
  name: string;
  icon?: Workout["icon"];
  scheduledDays?: Workout["scheduledDays"];
  exercises: Array<{
    id?: number;
    name: string;
    notes?: string;
    aiInfo?: Exercise["aiInfo"];
    x2Enabled?: boolean;
    negativeWeightEnabled?: boolean;
    sets: Array<{
      targetReps: number;
      targetWeight: number;
    }>;
  }>;
}

const STARTER_WORKOUT_DRAFTS: WorkoutDraft[] = [
  {
    name: "Oberkörper",
    icon: "dumbbell",
    exercises: [
      {
        name: "Brustpresse (Maschine)",
        sets: [
          { targetReps: 10, targetWeight: 35 },
          { targetReps: 10, targetWeight: 35 },
          { targetReps: 10, targetWeight: 35 }
        ]
      },
      {
        name: "Rudern sitzend (Maschine)",
        sets: [
          { targetReps: 10, targetWeight: 35 },
          { targetReps: 10, targetWeight: 35 },
          { targetReps: 10, targetWeight: 35 }
        ]
      },
      {
        name: "Latzug (Maschine)",
        sets: [
          { targetReps: 10, targetWeight: 35 },
          { targetReps: 10, targetWeight: 35 },
          { targetReps: 10, targetWeight: 35 }
        ]
      },
      {
        name: "Schulterdrücken (Maschine)",
        sets: [
          { targetReps: 12, targetWeight: 20 },
          { targetReps: 12, targetWeight: 20 },
          { targetReps: 12, targetWeight: 20 }
        ]
      },
      {
        name: "Seitheben (Kabel/Maschine)",
        sets: [
          { targetReps: 15, targetWeight: 7.5 },
          { targetReps: 15, targetWeight: 7.5 },
          { targetReps: 15, targetWeight: 7.5 }
        ]
      },
      {
        name: "Bizepscurl (Kabel oder Maschine)",
        x2Enabled: true,
        sets: [
          { targetReps: 12, targetWeight: 12.5 },
          { targetReps: 12, targetWeight: 12.5 },
          { targetReps: 12, targetWeight: 12.5 }
        ]
      },
      {
        name: "Trizepsdrücken (Kabelzug)",
        sets: [
          { targetReps: 12, targetWeight: 15 },
          { targetReps: 12, targetWeight: 15 },
          { targetReps: 12, targetWeight: 15 }
        ]
      }
    ]
  },
  {
    name: "Unterkörper",
    icon: "footprints",
    exercises: [
      {
        name: "Beinpresse",
        sets: [
          { targetReps: 10, targetWeight: 70 },
          { targetReps: 10, targetWeight: 70 },
          { targetReps: 10, targetWeight: 70 }
        ]
      },
      {
        name: "Rumänisches Kreuzheben (Kurzhantel)",
        sets: [
          { targetReps: 10, targetWeight: 20 },
          { targetReps: 10, targetWeight: 20 },
          { targetReps: 10, targetWeight: 20 }
        ]
      },
      {
        name: "Beinstrecker (Maschine)",
        sets: [
          { targetReps: 12, targetWeight: 35 },
          { targetReps: 12, targetWeight: 35 },
          { targetReps: 12, targetWeight: 35 }
        ]
      },
      {
        name: "Beinbeuger (Maschine)",
        sets: [
          { targetReps: 12, targetWeight: 30 },
          { targetReps: 12, targetWeight: 30 },
          { targetReps: 12, targetWeight: 30 }
        ]
      },
      {
        name: "Glute Kickback (Kabel)",
        x2Enabled: true,
        sets: [
          { targetReps: 15, targetWeight: 12.5 },
          { targetReps: 15, targetWeight: 12.5 },
          { targetReps: 15, targetWeight: 12.5 }
        ]
      },
      {
        name: "Wadenheben (Maschine)",
        sets: [
          { targetReps: 15, targetWeight: 40 },
          { targetReps: 15, targetWeight: 40 },
          { targetReps: 15, targetWeight: 40 }
        ]
      }
    ]
  }
];
const DEMO_WEEKS = 104;
const DEMO_WORKOUT_SCHEDULES: WorkoutScheduleDay[][] = [["mon"], ["thu"]];
type DemoSessionVariant = "main" | "pump" | "deload";

function nowIso() {
  return new Date().toISOString();
}

function cloneWorkoutDraft(draft: WorkoutDraft): WorkoutDraft {
  return {
    ...draft,
    scheduledDays: draft.scheduledDays ? [...draft.scheduledDays] : undefined,
    exercises: draft.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set }))
    }))
  };
}

function getStarterWorkoutDrafts() {
  return STARTER_WORKOUT_DRAFTS.map((draft) => cloneWorkoutDraft(draft));
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function convertWeightForUnit(valueKg: number, unit: WeightUnit) {
  if (unit === "kg") {
    return roundToStep(valueKg, 0.5);
  }

  return roundToStep(valueKg * 2.2046226218, 1);
}

function getStartOfIsoWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getDemoExerciseGainKg(params: {
  baseWeightKg: number;
  x2Enabled?: boolean;
  workoutIndex: number;
  exerciseIndex: number;
}) {
  const { baseWeightKg, x2Enabled, workoutIndex, exerciseIndex } = params;
  let gain = Math.max(
    baseWeightKg * (x2Enabled ? 0.18 : 0.32),
    baseWeightKg >= 60 ? 20 : baseWeightKg >= 35 ? 12.5 : baseWeightKg >= 20 ? 7.5 : baseWeightKg >= 10 ? 5 : 2.5
  );

  if (workoutIndex === 1 && exerciseIndex === 0) {
    gain += 7.5;
  }

  if (exerciseIndex === 0) {
    gain += 2.5;
  }

  return gain;
}

function getDemoSessionWeightKg(params: {
  baseWeightKg: number;
  weekIndex: number;
  totalWeeks: number;
  workoutIndex: number;
  exerciseIndex: number;
  x2Enabled?: boolean;
}) {
  const { baseWeightKg, weekIndex, totalWeeks, workoutIndex, exerciseIndex, x2Enabled } = params;
  const gain = getDemoExerciseGainKg({ baseWeightKg, x2Enabled, workoutIndex, exerciseIndex });
  const progress = totalWeeks <= 1 ? 1 : weekIndex / (totalWeeks - 1);
  const wavePattern = [0, 0.15, 0.3, 0.45, 0.7, 0.9, 0.55, 1];
  const waveProgress = wavePattern[weekIndex % wavePattern.length] ?? progress;
  let value = baseWeightKg + gain * Math.min(1, progress * 0.85 + waveProgress * 0.15);

  if ((weekIndex + 1) % 12 === 0) {
    value -= Math.max(1, gain * 0.08);
  }

  return Math.max(baseWeightKg * 0.8, value);
}

function getDemoActualReps(params: {
  targetReps: number;
  weekIndex: number;
  setIndex: number;
  x2Enabled?: boolean;
}) {
  const { targetReps, weekIndex, setIndex, x2Enabled } = params;
  const pattern = [1, 0, 0, -1, 1, 0, 1, 0];
  const delta = pattern[(weekIndex + setIndex) % pattern.length] ?? 0;
  const heavySetPenalty = setIndex > 0 ? 1 : 0;
  const minimum = x2Enabled ? 10 : Math.max(6, targetReps - 2);
  return Math.max(minimum, targetReps + delta - heavySetPenalty);
}

function getDemoExerciseAiInfo(name: string, language: AppLanguage) {
  const match = matchExerciseCatalogEntry(name);
  return match ? buildExerciseAiInfoForCatalogMatch(match, language) : undefined;
}

function getPatternValue(pattern: number[], index: number) {
  if (pattern.length === 0) {
    return 0;
  }

  return pattern[index % pattern.length] ?? pattern[0] ?? 0;
}

function getDemoWeekProfile(weekIndex: number) {
  const blockWeek = weekIndex % 12;
  const intensityPattern = [-0.05, -0.02, 0.01, 0.03, 0.06, 0.08, 0.04, -0.1, -0.02, 0.02, 0.05, -0.04];
  const repPattern = [1, 1, 0, 0, -1, -1, 0, 2, 1, 0, -1, 1];

  return {
    blockWeek,
    intensityOffset: intensityPattern[blockWeek] ?? 0,
    repBias: repPattern[blockWeek] ?? 0,
    isDeloadWeek: blockWeek === 7,
    isTravelWeek: weekIndex % 17 === 8,
    hasExtraUpperSession: blockWeek === 4 || weekIndex % 18 === 6,
    hasExtraLowerSession: blockWeek === 10 && weekIndex % 2 === 0
  };
}

function getDemoWeekSessionPlans(weekIndex: number) {
  const profile = getDemoWeekProfile(weekIndex);
  const plans: Array<{ workoutIndex: number; dayOffset: number; variant: DemoSessionVariant }> = [];
  const upperPrimaryOffsets = [0, 1, 0, 2, 3, 1, 0, 2, 4, 1, 0, 3, 0, 1, 2, 5];
  const lowerPrimaryOffsets = [3, 4, 2, 5, 3, 4, 6, 3, 5, 2, 4, 3, 5, 4, 6, 2];
  const upperPumpOffsets = [5, 6, 4, 5, 2, 6, 5, 4];
  const lowerPumpOffsets = [6, 5, 4, 6, 3, 5, 6, 4];
  const upperPreferredOffset = getPatternValue(upperPrimaryOffsets, weekIndex);
  const lowerPreferredOffset = getPatternValue(lowerPrimaryOffsets, weekIndex * 2 + 1);
  const upperRescheduledOffset = 7 + ((weekIndex + 1) % 3);
  const lowerRescheduledOffset = 7 + ((weekIndex + 2) % 3);
  const upperShouldBeLate = weekIndex % 9 === 5 || weekIndex % 14 === 3;
  const lowerShouldBeLate = weekIndex % 11 === 7 || weekIndex % 16 === 10;
  const upperCanceled = profile.isTravelWeek && weekIndex % 4 !== 0;
  const lowerCanceled = profile.isTravelWeek && weekIndex % 5 === 1;

  if (!upperCanceled) {
    plans.push({
      workoutIndex: 0,
      dayOffset: upperShouldBeLate ? upperRescheduledOffset : upperPreferredOffset,
      variant: profile.isDeloadWeek ? "deload" : "main"
    });
  }

  if (!lowerCanceled) {
    plans.push({
      workoutIndex: 1,
      dayOffset: lowerShouldBeLate ? lowerRescheduledOffset : lowerPreferredOffset,
      variant: profile.isDeloadWeek ? "deload" : "main"
    });
  }

  if (profile.hasExtraUpperSession && !profile.isTravelWeek) {
    plans.push({
      workoutIndex: 0,
      dayOffset: getPatternValue(upperPumpOffsets, weekIndex * 3 + 2),
      variant: "pump"
    });
  }

  if (profile.hasExtraLowerSession && !profile.isTravelWeek && !profile.isDeloadWeek) {
    plans.push({
      workoutIndex: 1,
      dayOffset: getPatternValue(lowerPumpOffsets, weekIndex * 2 + 4),
      variant: "pump"
    });
  }

  if (upperCanceled && weekIndex % 6 === 2) {
    plans.push({
      workoutIndex: 0,
      dayOffset: upperRescheduledOffset,
      variant: "pump"
    });
  }

  if (lowerCanceled && weekIndex % 7 === 3) {
    plans.push({
      workoutIndex: 1,
      dayOffset: lowerRescheduledOffset,
      variant: profile.isDeloadWeek ? "deload" : "pump"
    });
  }

  return plans;
}

async function getLatestCompletedSession(workoutId: number, beforeSessionId?: number) {
  const completedSessions = await db.sessions
    .where("workoutId")
    .equals(workoutId)
    .and((session) => session.status === "completed")
    .toArray();

  const filtered = completedSessions.filter((session) => {
    if (!beforeSessionId) {
      return true;
    }
    return (session.id ?? 0) < beforeSessionId;
  });

  filtered.sort((a, b) => {
    const aTime = new Date(a.finishedAt ?? a.startedAt).getTime();
    const bTime = new Date(b.finishedAt ?? b.startedAt).getTime();
    return bTime - aTime;
  });

  return filtered[0] ?? null;
}

async function getActiveSessionForWorkout(workoutId: number) {
  return db.sessions
    .where("workoutId")
    .equals(workoutId)
    .and((session) => session.status === "active")
    .first();
}

async function getAnyActiveSession() {
  const activeSessions = await db.sessions.where("status").equals("active").toArray();
  activeSessions.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  return activeSessions[0] ?? null;
}

export async function getWorkouts() {
  return db.workouts.orderBy("createdAt").reverse().toArray();
}

export async function getWorkoutById(workoutId: number): Promise<WorkoutWithRelations | null> {
  const workout = await db.workouts.get(workoutId);
  if (!workout) {
    return null;
  }

  const exercises = await db.exercises
    .where("workoutId")
    .equals(workoutId)
    .and((exercise) => exercise.isTemplate !== false)
    .sortBy("order");

  const exerciseIds = exercises.map((exercise) => exercise.id).filter((value): value is number => !!value);
  const sets = exerciseIds.length
    ? await db.exerciseTemplateSets.where("exerciseId").anyOf(exerciseIds).sortBy("order")
    : [];

  const exerciseMap = new Map<number, ExerciseTemplateSet[]>();

  for (const set of sets) {
    const current = exerciseMap.get(set.exerciseId) ?? [];
    current.push(set);
    exerciseMap.set(set.exerciseId, current);
  }

  return {
    workout,
    exercises: exercises.map((exercise) =>
      normalizeTemplateExerciseRelation(
        exercise,
        exercise.id ? (exerciseMap.get(exercise.id) ?? []) : []
      )
    )
  };
}

async function createWorkoutRecord(draft: WorkoutDraft) {
  const now = nowIso();
  const workout: Workout = {
    name: draft.name.trim(),
    icon: draft.icon,
    scheduledDays: normalizeWorkoutScheduledDays(draft.scheduledDays),
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };

  const workoutId = await db.workouts.add(workout);

  for (let exerciseIndex = 0; exerciseIndex < draft.exercises.length; exerciseIndex += 1) {
    const exerciseDraft = draft.exercises[exerciseIndex];

    const exercise: Exercise = {
      workoutId,
      name: exerciseDraft.name.trim(),
      notes: exerciseDraft.notes?.trim(),
      aiInfo: exerciseDraft.aiInfo,
      order: exerciseIndex,
      isTemplate: true,
      x2Enabled: exerciseDraft.x2Enabled ?? false,
      negativeWeightEnabled: exerciseDraft.negativeWeightEnabled ?? false,
      createdAt: now,
      updatedAt: now
    };

    const exerciseId = await db.exercises.add(exercise);

    for (let setIndex = 0; setIndex < exerciseDraft.sets.length; setIndex += 1) {
      const setDraft = exerciseDraft.sets[setIndex];
      await db.exerciseTemplateSets.add({
        exerciseId,
        order: setIndex,
        targetReps: setDraft.targetReps,
        targetWeight: normalizeExerciseWeightValue(
          setDraft.targetWeight,
          exerciseDraft.negativeWeightEnabled
        )
      });
    }
  }

  return workoutId;
}

export async function createWorkout(draft: WorkoutDraft) {
  const workoutId = await db.transaction(
    "rw",
    db.workouts,
    db.exercises,
    db.exerciseTemplateSets,
    async () => createWorkoutRecord(draft)
  );

  return workoutId;
}

export async function updateWorkout(workoutId: number, draft: WorkoutDraft) {
  const current = await db.workouts.get(workoutId);
  if (!current) {
    throw new Error("Workout not found");
  }

  await db.transaction(
    "rw",
    db.workouts,
    db.exercises,
    db.exerciseTemplateSets,
    async () => {
      const timestamp = nowIso();
      await db.workouts.update(workoutId, {
        name: draft.name.trim(),
        icon: draft.icon,
        scheduledDays: normalizeWorkoutScheduledDays(draft.scheduledDays),
        updatedAt: timestamp
      });

      const currentTemplateExercises = await db.exercises
        .where("workoutId")
        .equals(workoutId)
        .and((exercise) => exercise.isTemplate !== false)
        .toArray();

      const currentTemplateExerciseMap = new Map(
        currentTemplateExercises
          .filter((exercise): exercise is Exercise & { id: number } => typeof exercise.id === "number")
          .map((exercise) => [exercise.id, exercise])
      );
      const retainedTemplateExerciseIds = new Set(
        draft.exercises
          .map((exercise) => exercise.id)
          .filter((value): value is number => typeof value === "number" && currentTemplateExerciseMap.has(value))
      );
      const deletedTemplateExerciseIds = currentTemplateExercises
        .map((exercise) => exercise.id)
        .filter(
          (value): value is number =>
            typeof value === "number" && !retainedTemplateExerciseIds.has(value)
        );

      if (deletedTemplateExerciseIds.length) {
        await db.exerciseTemplateSets.where("exerciseId").anyOf(deletedTemplateExerciseIds).delete();
        await db.exercises.where("id").anyOf(deletedTemplateExerciseIds).delete();
      }

      for (let exerciseIndex = 0; exerciseIndex < draft.exercises.length; exerciseIndex += 1) {
        const exerciseDraft = draft.exercises[exerciseIndex];
        const existingExercise =
          typeof exerciseDraft.id === "number"
            ? currentTemplateExerciseMap.get(exerciseDraft.id)
            : undefined;
        const exerciseRecord: Exercise = {
          workoutId,
          name: exerciseDraft.name.trim(),
          notes: exerciseDraft.notes?.trim(),
          aiInfo: exerciseDraft.aiInfo,
          order: exerciseIndex,
          isTemplate: true,
          x2Enabled: exerciseDraft.x2Enabled ?? false,
          negativeWeightEnabled: exerciseDraft.negativeWeightEnabled ?? false,
          createdAt: existingExercise?.createdAt ?? timestamp,
          updatedAt: timestamp
        };
        const exerciseId = existingExercise
          ? (await db.exercises.put({ ...exerciseRecord, id: existingExercise.id }), existingExercise.id)
          : await db.exercises.add(exerciseRecord);

        await db.exerciseTemplateSets.where("exerciseId").equals(exerciseId).delete();

        for (let setIndex = 0; setIndex < exerciseDraft.sets.length; setIndex += 1) {
          const setDraft = exerciseDraft.sets[setIndex];
          await db.exerciseTemplateSets.add({
            exerciseId,
            order: setIndex,
            targetReps: setDraft.targetReps,
            targetWeight: normalizeExerciseWeightValue(
              setDraft.targetWeight,
              exerciseDraft.negativeWeightEnabled
            )
          });
        }
      }
    }
  );
}

export async function deleteWorkout(workoutId: number) {
  const workout = await db.workouts.get(workoutId);
  if (!workout) {
    throw new Error("Workout not found");
  }

  await db.transaction(
    "rw",
    [db.workouts, db.exercises, db.exerciseTemplateSets, db.sessions, db.sessionExerciseSets],
    async () => {
      const workoutExercises = await db.exercises.where("workoutId").equals(workoutId).toArray();
      const workoutExerciseIds = workoutExercises
        .map((exercise) => exercise.id)
        .filter((value): value is number => !!value);

      if (workoutExerciseIds.length > 0) {
        await db.exerciseTemplateSets.where("exerciseId").anyOf(workoutExerciseIds).delete();
      }
      await db.exercises.where("workoutId").equals(workoutId).delete();

      const sessions = await db.sessions.where("workoutId").equals(workoutId).toArray();
      const sessionIds = sessions.map((session) => session.id).filter((value): value is number => !!value);

      if (sessionIds.length > 0) {
        await db.sessionExerciseSets.where("sessionId").anyOf(sessionIds).delete();
      }
      await db.sessions.where("workoutId").equals(workoutId).delete();

      await db.workouts.delete(workoutId);
    }
  );
}

export async function ensureDefaultWorkout() {
  const count = await db.workouts.count();
  if (count > 0) {
    return;
  }

  for (const draft of getStarterWorkoutDrafts()) {
    await createWorkout(draft);
  }
}

export async function startSession(workoutId: number) {
  const anyActiveSession = await getAnyActiveSession();
  if (anyActiveSession?.id) {
    return anyActiveSession.id;
  }

  const existingActiveSession = await getActiveSessionForWorkout(workoutId);
  if (existingActiveSession?.id) {
    return existingActiveSession.id;
  }

  const fullWorkout = await getWorkoutById(workoutId);
  if (!fullWorkout) {
    throw new Error("Workout not found");
  }

  const sessionId = await db.transaction(
    "rw",
    db.sessions,
    db.sessionExerciseSets,
    async () => {
      const now = nowIso();
      const createdSessionId = await db.sessions.add({
        workoutId,
        startedAt: now,
        status: "active",
        createdAt: now
      });

      for (const exerciseBlock of fullWorkout.exercises) {
        const templateExerciseId = exerciseBlock.exercise.id;
        if (!templateExerciseId) {
          continue;
        }

        for (const set of exerciseBlock.sets) {
          const normalizedWeight = normalizeExerciseWeightValue(
            set.targetWeight,
            exerciseBlock.exercise.negativeWeightEnabled
          );
          await db.sessionExerciseSets.add({
            sessionId: createdSessionId,
            templateExerciseId,
            sessionExerciseKey: `template-${templateExerciseId}`,
            exerciseName: exerciseBlock.exercise.name,
            exerciseNotes: exerciseBlock.exercise.notes,
            exerciseAiInfo: exerciseBlock.exercise.aiInfo,
            exerciseOrder: exerciseBlock.exercise.order,
            isTemplateExercise: true,
            x2Enabled: exerciseBlock.exercise.x2Enabled ?? false,
            negativeWeightEnabled: exerciseBlock.exercise.negativeWeightEnabled ?? false,
            templateSetOrder: set.order,
            targetReps: set.targetReps,
            targetWeight: normalizedWeight,
            actualReps: set.targetReps,
            actualWeight: normalizedWeight,
            completed: false
          });
        }
      }

      return createdSessionId;
    }
  );

  return sessionId;
}

export async function getSessionById(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const workout = await getWorkoutById(session.workoutId);
  if (!workout) {
    return null;
  }

  const sets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();

  return {
    session,
    workout,
    sets
  };
}

export async function updateSessionSet(
  setId: number,
  patch: Partial<Pick<SessionExerciseSet, "actualReps" | "actualWeight" | "completed">>
) {
  const current = await db.sessionExerciseSets.get(setId);
  if (!current) {
    throw new Error("Set not found");
  }

  const nextCompletedAt =
    patch.completed === undefined
      ? current.completedAt
      : patch.completed
        ? nowIso()
        : undefined;
  const negativeWeightEnabled =
    current.negativeWeightEnabled === true ||
    (current.actualWeight ?? current.targetWeight) < 0 ||
    current.targetWeight < 0 ||
    (current.templateExerciseId !== undefined
      ? ((await db.exercises.get(current.templateExerciseId))?.negativeWeightEnabled ?? false)
      : false) ||
    false;
  const normalizedPatch = patch.actualWeight === undefined
    ? patch
    : {
        ...patch,
        actualWeight: normalizeExerciseWeightValue(patch.actualWeight, negativeWeightEnabled)
      };

  await db.sessionExerciseSets.update(setId, {
    ...normalizedPatch,
    negativeWeightEnabled,
    completedAt: nextCompletedAt
  });
}

export async function reorderSessionExercises(sessionId: number, orderedSessionExerciseKeys: string[]) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  await db.transaction("rw", db.sessionExerciseSets, async () => {
    const sets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
    const existingKeys = Array.from(new Set(sets.map((set) => set.sessionExerciseKey)));
    const orderedUniqueKeys = Array.from(new Set(orderedSessionExerciseKeys));

    if (existingKeys.length !== orderedUniqueKeys.length) {
      throw new Error("Session exercise reorder payload is incomplete");
    }

    const existingKeySet = new Set(existingKeys);
    if (orderedUniqueKeys.some((key) => !existingKeySet.has(key))) {
      throw new Error("Session exercise reorder payload contains unknown exercise");
    }

    const orderByKey = new Map(orderedUniqueKeys.map((key, index) => [key, index]));
    for (const set of sets) {
      if (set.id === undefined) {
        continue;
      }
      const nextOrder = orderByKey.get(set.sessionExerciseKey);
      if (nextOrder === undefined) {
        continue;
      }
      if (set.exerciseOrder !== nextOrder) {
        await db.sessionExerciseSets.update(set.id, { exerciseOrder: nextOrder });
      }
    }
  });
}

export async function addSessionSet(sessionId: number, sessionExerciseKey: string) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  const exerciseSets = await db.sessionExerciseSets
    .where("sessionId")
    .equals(sessionId)
    .and((set) => set.sessionExerciseKey === sessionExerciseKey)
    .toArray();

  if (exerciseSets.length === 0) {
    throw new Error("Exercise not found in active session");
  }

  const sortedSets = exerciseSets.sort((a, b) => a.templateSetOrder - b.templateSetOrder);
  const firstSet = sortedSets[0];
  const lastSet = sortedSets[sortedSets.length - 1];
  const templateSetOrder = lastSet.templateSetOrder + 1;
  const targetReps = lastSet.actualReps ?? lastSet.targetReps;
  const targetWeight = normalizeExerciseWeightValue(
    lastSet.actualWeight ?? lastSet.targetWeight,
    firstSet.negativeWeightEnabled
  );

  return db.sessionExerciseSets.add({
    sessionId,
    templateExerciseId: firstSet.templateExerciseId,
    sessionExerciseKey,
    exerciseName: firstSet.exerciseName,
    exerciseNotes: firstSet.exerciseNotes,
    exerciseAiInfo: firstSet.exerciseAiInfo,
    exerciseOrder: firstSet.exerciseOrder,
    isTemplateExercise: firstSet.isTemplateExercise,
    x2Enabled: firstSet.x2Enabled ?? false,
    negativeWeightEnabled: firstSet.negativeWeightEnabled ?? false,
    templateSetOrder,
    targetReps,
    targetWeight,
    actualReps: targetReps,
    actualWeight: targetWeight,
    completed: false
  });
}

export async function addSessionExercise(sessionId: number, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Exercise name is required");
  }

  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  const currentSets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
  const existingNames = new Set(
    currentSets.map((set) => set.exerciseName.trim().toLowerCase())
  );

  const normalizedBase = trimmedName.toLowerCase();
  let finalName = trimmedName;
  let suffix = 2;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${trimmedName} ${suffix}`;
    suffix += 1;
  }

  const maxOrder = currentSets.reduce((maxValue, set) => Math.max(maxValue, set.exerciseOrder), -1);
  const sessionExerciseKey = `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await db.sessionExerciseSets.add({
    sessionId,
    sessionExerciseKey,
    exerciseName: finalName,
    exerciseNotes: "",
    exerciseAiInfo: undefined,
    exerciseOrder: maxOrder + 1,
    isTemplateExercise: false,
    x2Enabled: false,
    templateSetOrder: 0,
    targetReps: 10,
    targetWeight: 0,
    actualReps: 10,
    actualWeight: 0,
    completed: false
  });

  return { sessionExerciseKey, normalizedBase };
}

export async function addSessionExerciseFromPrevious(sessionId: number, previousSets: SessionExerciseSet[]) {
  if (previousSets.length === 0) {
    throw new Error("Previous exercise sets are required");
  }

  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  const sortedPreviousSets = [...previousSets]
    .sort((a, b) => a.templateSetOrder - b.templateSetOrder)
    .map((set) => normalizeSessionExerciseSet(set));
  const firstSet = sortedPreviousSets[0];
  const trimmedName = firstSet.exerciseName.trim();
  if (!trimmedName) {
    throw new Error("Exercise name is required");
  }

  const currentSets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
  const existingNames = new Set(currentSets.map((set) => set.exerciseName.trim().toLowerCase()));

  const normalizedBase = trimmedName.toLowerCase();
  let finalName = trimmedName;
  let suffix = 2;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${trimmedName} ${suffix}`;
    suffix += 1;
  }

  const maxOrder = currentSets.reduce((maxValue, set) => Math.max(maxValue, set.exerciseOrder), -1);
  const sessionExerciseKey = `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await db.transaction("rw", db.sessionExerciseSets, async () => {
    for (let index = 0; index < sortedPreviousSets.length; index += 1) {
      const set = sortedPreviousSets[index];
      const targetReps = set.actualReps ?? set.targetReps;
      const targetWeight = normalizeExerciseWeightValue(
        set.actualWeight ?? set.targetWeight,
        firstSet.negativeWeightEnabled
      );
      await db.sessionExerciseSets.add({
        sessionId,
        sessionExerciseKey,
        exerciseName: finalName,
        exerciseNotes: firstSet.exerciseNotes,
        exerciseAiInfo: firstSet.exerciseAiInfo,
        exerciseOrder: maxOrder + 1,
        isTemplateExercise: false,
        x2Enabled: firstSet.x2Enabled ?? false,
        negativeWeightEnabled: firstSet.negativeWeightEnabled ?? false,
        templateSetOrder: index,
        targetReps,
        targetWeight,
        actualReps: targetReps,
        actualWeight: targetWeight,
        completed: false
      });
    }
  });

  return { sessionExerciseKey, normalizedBase };
}

export async function removeSessionSet(setId: number) {
  const set = await db.sessionExerciseSets.get(setId);
  if (!set) {
    throw new Error("Set not found");
  }

  const session = await db.sessions.get(set.sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  await db.sessionExerciseSets.delete(setId);
}

export async function removeSessionExercise(sessionId: number, sessionExerciseKey: string) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  await db.sessionExerciseSets
    .where("sessionId")
    .equals(sessionId)
    .and((set) => set.sessionExerciseKey === sessionExerciseKey)
    .delete();
}

async function applySessionAsTemplate(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const sets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
  const grouped = new Map<string, SessionExerciseSet[]>();

  for (const set of sets) {
    const current = grouped.get(set.sessionExerciseKey) ?? [];
    current.push(set);
    grouped.set(set.sessionExerciseKey, current);
  }

  const sessionExercises = [...grouped.values()]
    .map((exerciseSets) =>
      exerciseSets
        .sort((a, b) => a.templateSetOrder - b.templateSetOrder)
        .map((set) => normalizeSessionExerciseSet(set))
    )
    .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);

  await db.transaction("rw", db.exercises, db.exerciseTemplateSets, async () => {
    const currentTemplateExercises = await db.exercises
      .where("workoutId")
      .equals(session.workoutId)
      .and((exercise) => exercise.isTemplate !== false)
      .toArray();

    const currentTemplateExerciseIds = currentTemplateExercises
      .map((exercise) => exercise.id)
      .filter((value): value is number => !!value);

    if (currentTemplateExerciseIds.length > 0) {
      await db.exerciseTemplateSets.where("exerciseId").anyOf(currentTemplateExerciseIds).delete();
      await db.exercises.where("id").anyOf(currentTemplateExerciseIds).delete();
    }

    const now = nowIso();

    for (let exerciseIndex = 0; exerciseIndex < sessionExercises.length; exerciseIndex += 1) {
      const exerciseSets = sessionExercises[exerciseIndex];
      const firstSet = exerciseSets[0];

      const exerciseId = await db.exercises.add({
        workoutId: session.workoutId,
        name: firstSet.exerciseName,
        notes: firstSet.exerciseNotes,
        aiInfo: firstSet.exerciseAiInfo,
        order: exerciseIndex,
        isTemplate: true,
        x2Enabled: firstSet.x2Enabled ?? false,
        negativeWeightEnabled: firstSet.negativeWeightEnabled ?? false,
        createdAt: now,
        updatedAt: now
      });

      for (let setIndex = 0; setIndex < exerciseSets.length; setIndex += 1) {
        const set = exerciseSets[setIndex];
        await db.exerciseTemplateSets.add({
          exerciseId,
          order: setIndex,
          targetReps: set.actualReps ?? set.targetReps,
          targetWeight: normalizeExerciseWeightValue(
            set.actualWeight ?? set.targetWeight,
            firstSet.negativeWeightEnabled
          )
        });
      }
    }
  });
}

export async function completeSession(sessionId: number, useAsTemplate = false) {
  const session = await db.sessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (useAsTemplate) {
    await applySessionAsTemplate(sessionId);
  }

  const sets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
  const latestCompletedAt = sets
    .filter((set) => set.completed && typeof set.completedAt === "string")
    .reduce<string | null>((latest, set) => {
      if (!set.completedAt) {
        return latest;
      }
      if (!latest) {
        return set.completedAt;
      }
      return new Date(set.completedAt).getTime() > new Date(latest).getTime() ? set.completedAt : latest;
    }, null);

  await db.sessions.update(sessionId, {
    status: "completed",
    finishedAt: latestCompletedAt ?? nowIso()
  });
}

export async function discardSession(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Active session not found");
  }

  await db.transaction("rw", db.sessions, db.sessionExerciseSets, async () => {
    await db.sessionExerciseSets.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function getPreviousCompletedSession(workoutId: number, beforeSessionId: number) {
  return getLatestCompletedSession(workoutId, beforeSessionId);
}

export async function getPreviousSessionSummary(
  workoutId: number,
  beforeSessionId: number
): Promise<PreviousSessionSummary | null> {
  const previousSession = await getLatestCompletedSession(workoutId, beforeSessionId);
  if (!previousSession?.id) {
    return null;
  }

  const sets = await db.sessionExerciseSets.where("sessionId").equals(previousSession.id).toArray();
  const grouped = new Map<string, SessionExerciseSet[]>();

  for (const set of sets) {
    const current = grouped.get(set.sessionExerciseKey) ?? [];
    current.push(set);
    grouped.set(set.sessionExerciseKey, current);
  }

  const templateExerciseSets: Record<number, SessionExerciseSet[]> = {};
  const extraExercises: Array<{ name: string; sets: SessionExerciseSet[] }> = [];

  for (const groupSets of grouped.values()) {
    const sortedCompleted = groupSets
      .filter((set) => set.completed)
      .sort((a, b) => a.templateSetOrder - b.templateSetOrder)
      .map((set) => normalizeSessionExerciseSet(set));

    if (sortedCompleted.length === 0) {
      continue;
    }

    const firstSet = sortedCompleted[0];

    if (firstSet.isTemplateExercise && firstSet.templateExerciseId !== undefined) {
      templateExerciseSets[firstSet.templateExerciseId] = sortedCompleted;
      continue;
    }

    extraExercises.push({
      name: firstSet.exerciseName,
      sets: sortedCompleted
    });
  }

  return {
    completedAt: previousSession.finishedAt ?? previousSession.startedAt,
    templateExerciseSets,
    extraExercises
  };
}

export async function importWorkouts(drafts: WorkoutDraft[]) {
  for (const draft of drafts) {
    await createWorkoutRecord(draft);
  }
}

export interface WorkoutSessionHistoryItem {
  session: Session & { id: number };
  sets: SessionExerciseSet[];
}

export interface SessionSetUpdateDraft {
  id?: number;
  templateExerciseId?: number;
  sessionExerciseKey: string;
  exerciseName: string;
  exerciseNotes?: string;
  exerciseAiInfo?: Exercise["aiInfo"];
  exerciseOrder: number;
  isTemplateExercise: boolean;
  x2Enabled?: boolean;
  negativeWeightEnabled?: boolean;
  templateSetOrder: number;
  actualReps: number;
  actualWeight: number;
  completed: boolean;
}

interface CompletedSessionTimingUpdate {
  startedAt: string;
  finishedAt: string;
}

export async function getWorkoutSessionHistory(workoutId: number): Promise<WorkoutSessionHistoryItem[]> {
  const sessions = await db.sessions
    .where("workoutId")
    .equals(workoutId)
    .and((session) => session.status === "completed" && session.id !== undefined)
    .toArray();

  const withIds = sessions
    .filter((session): session is Session & { id: number } => session.id !== undefined)
    .sort((a, b) => new Date(b.finishedAt ?? b.startedAt).getTime() - new Date(a.finishedAt ?? a.startedAt).getTime());

  const sessionIds = withIds.map((session) => session.id);
  const sessionSets = sessionIds.length ? await db.sessionExerciseSets.where("sessionId").anyOf(sessionIds).toArray() : [];

  const bySession = new Map<number, SessionExerciseSet[]>();
  for (const set of sessionSets) {
    const current = bySession.get(set.sessionId) ?? [];
    current.push(set);
    bySession.set(set.sessionId, current);
  }

  return withIds.map((session) => ({
    session,
    sets: (bySession.get(session.id) ?? []).sort((a, b) => {
      if (a.exerciseOrder !== b.exerciseOrder) {
        return a.exerciseOrder - b.exerciseOrder;
      }
      return a.templateSetOrder - b.templateSetOrder;
    })
  }));
}

export async function deleteCompletedSession(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "completed") {
    throw new Error("Completed session not found");
  }

  await db.transaction("rw", db.sessions, db.sessionExerciseSets, async () => {
    await db.sessionExerciseSets.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function updateCompletedSessionSets(
  sessionId: number,
  updates: SessionSetUpdateDraft[],
  timingUpdate?: CompletedSessionTimingUpdate
) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "completed") {
    throw new Error("Completed session not found");
  }

  if (timingUpdate) {
    const startedMs = new Date(timingUpdate.startedAt).getTime();
    const finishedMs = new Date(timingUpdate.finishedAt).getTime();
    if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
      throw new Error("Invalid completed session timing");
    }
  }

  await db.transaction("rw", db.sessions, db.sessionExerciseSets, async () => {
    const completedAtFallback = timingUpdate?.finishedAt ?? session.finishedAt ?? nowIso();

    if (timingUpdate) {
      await db.sessions.update(sessionId, {
        startedAt: timingUpdate.startedAt,
        finishedAt: timingUpdate.finishedAt
      });
    }

    const currentSets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
    const currentSetById = new Map(
      currentSets
        .filter((set): set is SessionExerciseSet & { id: number } => set.id !== undefined)
        .map((set) => [set.id, set])
    );
    const keptSetIds = new Set(
      updates
        .map((draft) => draft.id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    );
    const deletedSetIds = currentSets
      .map((set) => set.id)
      .filter((id): id is number => id !== undefined && !keptSetIds.has(id));

    if (deletedSetIds.length > 0) {
      await db.sessionExerciseSets.where("id").anyOf(deletedSetIds).delete();
    }

    for (const draft of updates) {
      if (draft.id !== undefined && draft.id > 0) {
        const current = currentSetById.get(draft.id);
        if (!current || current.sessionId !== sessionId) {
          continue;
        }

        await db.sessionExerciseSets.update(draft.id, {
          sessionExerciseKey: draft.sessionExerciseKey,
          exerciseName: draft.exerciseName,
          exerciseNotes: draft.exerciseNotes,
          exerciseAiInfo: draft.exerciseAiInfo,
          exerciseOrder: draft.exerciseOrder,
          isTemplateExercise: draft.isTemplateExercise,
          x2Enabled: draft.x2Enabled ?? false,
          negativeWeightEnabled: draft.negativeWeightEnabled ?? false,
          templateSetOrder: draft.templateSetOrder,
          actualReps: draft.actualReps,
          actualWeight: normalizeExerciseWeightValue(draft.actualWeight, draft.negativeWeightEnabled),
          completed: draft.completed,
          completedAt: draft.completed ? current.completedAt ?? completedAtFallback : undefined
        });
        continue;
      }

      await db.sessionExerciseSets.add({
        sessionId,
        templateExerciseId: draft.templateExerciseId,
        sessionExerciseKey: draft.sessionExerciseKey,
        exerciseName: draft.exerciseName,
        exerciseNotes: draft.exerciseNotes,
        exerciseAiInfo: draft.exerciseAiInfo,
        exerciseOrder: draft.exerciseOrder,
        isTemplateExercise: draft.isTemplateExercise,
        x2Enabled: draft.x2Enabled ?? false,
        negativeWeightEnabled: draft.negativeWeightEnabled ?? false,
        templateSetOrder: draft.templateSetOrder,
        targetReps: draft.actualReps,
        targetWeight: normalizeExerciseWeightValue(draft.actualWeight, draft.negativeWeightEnabled),
        actualReps: draft.actualReps,
        actualWeight: normalizeExerciseWeightValue(draft.actualWeight, draft.negativeWeightEnabled),
        completed: draft.completed,
        completedAt: draft.completed ? completedAtFallback : undefined
      });
    }
  });
}

export async function getAllSessionsByWorkout(workoutId: number) {
  return db.sessions
    .where("workoutId")
    .equals(workoutId)
    .reverse()
    .sortBy("startedAt");
}

export async function seedDemoDataIfEmpty() {
  const [workoutCount, exerciseCount, sessionCount, sessionSetCount] = await Promise.all([
    db.workouts.count(),
    db.exercises.count(),
    db.sessions.count(),
    db.sessionExerciseSets.count()
  ]);

  if (workoutCount > 0 || exerciseCount > 0 || sessionCount > 0 || sessionSetCount > 0) {
    return false;
  }

  const currentSettings = await ensureDefaultSettings();
  const now = new Date();
  const earliestWeekStart = addDays(getStartOfIsoWeek(now), -(DEMO_WEEKS - 1) * 7);
  const demoDrafts = getStarterWorkoutDrafts().map((draft, index) => ({
    ...draft,
    scheduledDays: DEMO_WORKOUT_SCHEDULES[index] ? [...DEMO_WORKOUT_SCHEDULES[index]] : undefined
  }));
  const unitStep = currentSettings.weightUnit === "kg" ? 0.5 : 1;
  const workouts: Array<Workout & { id: number }> = [];
  const exercises: Array<Exercise & { id: number }> = [];
  const exerciseTemplateSets: Array<ExerciseTemplateSet & { id: number }> = [];
  const sessions: Array<Session & { id: number }> = [];
  const sessionExerciseSets: Array<SessionExerciseSet & { id: number }> = [];
  let nextExerciseId = 1;
  let nextTemplateSetId = 1;
  let nextSessionId = 1;
  let nextSessionSetId = 1;

  const workoutRecords = demoDrafts.map((draft, workoutIndex) => {
    const workoutId = workoutIndex + 1;
    const createdAt = addDays(earliestWeekStart, -2 + workoutIndex).toISOString();
    const templateExercises = draft.exercises.map((exerciseDraft, exerciseIndex) => {
      const exerciseId = nextExerciseId;
      nextExerciseId += 1;
      const aiInfo = getDemoExerciseAiInfo(exerciseDraft.name, currentSettings.language);
      const exerciseRecord: Exercise & { id: number } = {
        id: exerciseId,
        workoutId,
        name: exerciseDraft.name.trim(),
        notes: exerciseDraft.notes?.trim(),
        aiInfo,
        order: exerciseIndex,
        isTemplate: true,
        x2Enabled: exerciseDraft.x2Enabled ?? false,
        negativeWeightEnabled: exerciseDraft.negativeWeightEnabled ?? false,
        createdAt,
        updatedAt: now.toISOString()
      };
      const templateSetRecords = exerciseDraft.sets.map((setDraft, setIndex) => {
        const targetWeight = roundToStep(
          convertWeightForUnit(
            getDemoSessionWeightKg({
              baseWeightKg: setDraft.targetWeight,
              weekIndex: DEMO_WEEKS - 1,
              totalWeeks: DEMO_WEEKS,
              workoutIndex,
              exerciseIndex,
              x2Enabled: exerciseDraft.x2Enabled
            }),
            currentSettings.weightUnit
          ),
          unitStep
        );
        const templateSet: ExerciseTemplateSet & { id: number } = {
          id: nextTemplateSetId,
          exerciseId,
          order: setIndex,
          targetReps: setDraft.targetReps,
          targetWeight
        };
        nextTemplateSetId += 1;
        return templateSet;
      });

      exercises.push(exerciseRecord);
      exerciseTemplateSets.push(...templateSetRecords);

      return {
        exercise: exerciseRecord,
        templateSets: templateSetRecords,
        baseSets: exerciseDraft.sets.map((set) => ({ ...set }))
      };
    });

    const workoutRecord: Workout & { id: number } = {
      id: workoutId,
      name: draft.name,
      icon: draft.icon,
      scheduledDays: draft.scheduledDays,
      createdAt,
      updatedAt: now.toISOString(),
      archivedAt: null
    };

    workouts.push(workoutRecord);

    return {
      workout: workoutRecord,
      templateExercises
    };
  });

  for (let weekIndex = 0; weekIndex < DEMO_WEEKS; weekIndex += 1) {
    const weekProfile = getDemoWeekProfile(weekIndex);
    const sessionPlans = getDemoWeekSessionPlans(weekIndex);

    for (const plan of sessionPlans) {
      const workoutIndex = plan.workoutIndex;
      const workoutRecord = workoutRecords[workoutIndex];
      if (!workoutRecord) {
        continue;
      }

      const { workout, templateExercises } = workoutRecord;
      const sessionDate = addDays(earliestWeekStart, weekIndex * 7 + plan.dayOffset);
      sessionDate.setHours(
        18 + workoutIndex,
        plan.variant === "pump" ? 5 : workoutIndex === 0 ? 15 : 45,
        0,
        0
      );
      if (sessionDate.getTime() >= now.getTime()) {
        continue;
      }

      const sessionId = nextSessionId;
      nextSessionId += 1;
      const sessionStart = new Date(sessionDate);
      const sessionRecord: Session & { id: number } = {
        id: sessionId,
        workoutId: workout.id,
        startedAt: sessionStart.toISOString(),
        finishedAt: sessionStart.toISOString(),
        status: "completed",
        createdAt: sessionStart.toISOString()
      };

      let latestCompletedAt = sessionStart.getTime() + 6 * 60_000;
      let sessionExerciseOrder = 0;

      templateExercises.forEach(({ exercise, templateSets, baseSets }, exerciseIndex) => {
        const isPumpSession = plan.variant === "pump";
        const isDeloadSession = plan.variant === "deload";
        const includeExercise =
          isPumpSession
            ? workoutIndex === 0
              ? exerciseIndex < 5
              : exerciseIndex < 4
            : isDeloadSession
              ? exerciseIndex < templateExercises.length - 1
              : !(weekProfile.isTravelWeek && workoutIndex === 0 && exerciseIndex === templateExercises.length - 1);

        if (!includeExercise) {
          return;
        }

        const baseSetCount = isDeloadSession
          ? Math.max(2, templateSets.length - 1)
          : isPumpSession
            ? Math.max(2, templateSets.length - (exerciseIndex > 1 ? 1 : 0))
            : templateSets.length;
        const extraSetCount =
          isPumpSession
            ? exerciseIndex < 2
              ? 1
              : 0
            : !isDeloadSession && (exerciseIndex === 0 || (exerciseIndex === 1 && weekProfile.blockWeek >= 4 && weekProfile.blockWeek <= 6))
              ? 1
              : 0;
        const totalSetCount = baseSetCount + extraSetCount;

        for (let setIndex = 0; setIndex < totalSetCount; setIndex += 1) {
          const sourceSetIndex = Math.min(setIndex, templateSets.length - 1);
          const templateSet = templateSets[sourceSetIndex];
          const baseSet = baseSets[sourceSetIndex];
          const variantWeightMultiplier =
            plan.variant === "pump"
              ? 0.88
              : isDeloadSession
                ? 0.84
                : 1 + weekProfile.intensityOffset;
          const extraSetWeightMultiplier = setIndex >= templateSets.length ? 0.94 : 1;
          const adjustedWeightKg = Math.max(
            baseSet.targetWeight * 0.72,
            getDemoSessionWeightKg({
              baseWeightKg: baseSet.targetWeight,
              weekIndex,
              totalWeeks: DEMO_WEEKS,
              workoutIndex,
              exerciseIndex,
              x2Enabled: exercise.x2Enabled
            }) *
              variantWeightMultiplier *
              extraSetWeightMultiplier
          );
          const targetWeight = roundToStep(
            convertWeightForUnit(adjustedWeightKg, currentSettings.weightUnit),
            unitStep
          );
          const targetReps = Math.max(
            6,
            templateSet.targetReps + (isPumpSession ? 2 : isDeloadSession ? 1 : 0)
          );
          const actualReps = Math.max(
            isPumpSession ? 10 : 6,
            getDemoActualReps({
              targetReps,
              weekIndex,
              setIndex,
              x2Enabled: exercise.x2Enabled
            }) + weekProfile.repBias
          );
          const actualWeight = roundToStep(
            Math.max(
              0,
              targetWeight +
                (plan.variant === "main" && setIndex === totalSetCount - 1 && weekIndex % 6 === 4 ? unitStep : 0)
            ),
            unitStep
          );
          const completedAt = new Date(
            sessionStart.getTime() +
              (sessionExerciseOrder * (plan.variant === "pump" ? 10 : 12) + setIndex * 3 + 8) * 60_000 +
              (weekIndex % 3) * 20_000
          );

          latestCompletedAt = Math.max(latestCompletedAt, completedAt.getTime());
          sessionExerciseSets.push({
            id: nextSessionSetId,
            sessionId,
            templateExerciseId: exercise.id,
            sessionExerciseKey: `template-${exercise.id}`,
            exerciseName: exercise.name,
            exerciseNotes: exercise.notes,
            exerciseAiInfo: exercise.aiInfo,
            exerciseOrder: sessionExerciseOrder,
            isTemplateExercise: true,
            x2Enabled: exercise.x2Enabled ?? false,
            negativeWeightEnabled: exercise.negativeWeightEnabled ?? false,
            templateSetOrder: setIndex,
            targetReps,
            targetWeight,
            actualReps,
            actualWeight,
            completed: true,
            completedAt: completedAt.toISOString()
          });
          nextSessionSetId += 1;
        }

        sessionExerciseOrder += 1;
      });

      const finishedAt = new Date(
        latestCompletedAt + (plan.variant === "pump" ? 4 : 6 + (weekIndex % 4)) * 60_000
      ).toISOString();
      sessionRecord.finishedAt = finishedAt;
      sessions.push(sessionRecord);
    }
  }

  const settingsCreatedAt = currentSettings.createdAt || earliestWeekStart.toISOString();
  const settings: Settings = {
    ...currentSettings,
    id: 1,
    weightUnit: currentSettings.weightUnit,
    language: currentSettings.language,
    restTimerEnabled: currentSettings.restTimerEnabled ?? true,
    restTimerSeconds: currentSettings.restTimerSeconds ?? 120,
    bodyWeight: convertWeightForUnit(81.4, currentSettings.weightUnit),
    weeklyWorkoutCountGoal: 2,
    weeklyDurationGoal: 150,
    weeklyCaloriesGoal: 1400,
    weeklyWeightGoal: convertWeightForUnit(14_000, currentSettings.weightUnit),
    lockerNoteEnabled: true,
    lockerNumber: "207",
    lockerNumberUpdatedAt: addDays(now, -1).toISOString(),
    colorScheme: currentSettings.colorScheme ?? "system",
    weekStartsOn: currentSettings.weekStartsOn ?? "mon",
    createdAt: settingsCreatedAt,
    updatedAt: now.toISOString()
  };

  await importAllDataSnapshot({
    settings: [settings],
    workouts,
    exercises,
    exerciseTemplateSets,
    sessions,
    sessionExerciseSets
  });

  return true;
}

export function formatWeightLabel(weight: number | undefined, unit: WeightUnit) {
  if (weight === undefined) {
    return "-";
  }
  return `${weight} ${unit}`;
}

export type { WorkoutDraft };
