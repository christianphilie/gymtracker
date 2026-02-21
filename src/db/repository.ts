import { db } from "@/db/db";
import type {
  Exercise,
  ExerciseTemplateSet,
  LastExerciseSetSnapshot,
  SessionExerciseSet,
  Settings,
  WeightUnit,
  Workout,
  WorkoutWithRelations
} from "@/db/types";

interface WorkoutDraft {
  name: string;
  exercises: Array<{
    name: string;
    notes?: string;
    sets: Array<{
      targetReps: number;
      targetWeight: number;
    }>;
  }>;
}

const SETTINGS_ID = 1;

function nowIso() {
  return new Date().toISOString();
}

export async function ensureDefaultSettings() {
  const existing = await db.settings.get(SETTINGS_ID);
  if (existing) {
    return existing;
  }

  const now = nowIso();
  const defaults: Settings = {
    id: SETTINGS_ID,
    language: "de",
    weightUnit: "kg",
    createdAt: now,
    updatedAt: now
  };

  await db.settings.put(defaults);
  return defaults;
}

export async function updateSettings(patch: Partial<Pick<Settings, "language" | "weightUnit">>) {
  const current = await ensureDefaultSettings();
  const next: Settings = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };
  await db.settings.put(next);
  return next;
}

export async function getSettings() {
  return ensureDefaultSettings();
}

export async function getWorkouts() {
  return db.workouts.orderBy("createdAt").reverse().toArray();
}

export async function getWorkoutById(workoutId: number): Promise<WorkoutWithRelations | null> {
  const workout = await db.workouts.get(workoutId);
  if (!workout) {
    return null;
  }

  const exercises = await db.exercises.where("workoutId").equals(workoutId).sortBy("order");
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
    exercises: exercises.map((exercise) => ({
      exercise,
      sets: exercise.id ? (exerciseMap.get(exercise.id) ?? []) : []
    }))
  };
}

async function createWorkoutRecord(draft: WorkoutDraft) {
  const now = nowIso();
  const workout: Workout = {
    name: draft.name.trim(),
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
      order: exerciseIndex,
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
        targetWeight: setDraft.targetWeight
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
      await db.workouts.update(workoutId, {
        name: draft.name.trim(),
        updatedAt: nowIso()
      });

      const currentExercises = await db.exercises.where("workoutId").equals(workoutId).toArray();
      const currentExerciseIds = currentExercises
        .map((exercise) => exercise.id)
        .filter((value): value is number => !!value);

      if (currentExerciseIds.length) {
        await db.exerciseTemplateSets.where("exerciseId").anyOf(currentExerciseIds).delete();
      }
      await db.exercises.where("workoutId").equals(workoutId).delete();

      for (let exerciseIndex = 0; exerciseIndex < draft.exercises.length; exerciseIndex += 1) {
        const exerciseDraft = draft.exercises[exerciseIndex];
        const exerciseId = await db.exercises.add({
          workoutId,
          name: exerciseDraft.name.trim(),
          notes: exerciseDraft.notes?.trim(),
          order: exerciseIndex,
          createdAt: current.createdAt,
          updatedAt: nowIso()
        });

        for (let setIndex = 0; setIndex < exerciseDraft.sets.length; setIndex += 1) {
          const setDraft = exerciseDraft.sets[setIndex];
          await db.exerciseTemplateSets.add({
            exerciseId,
            order: setIndex,
            targetReps: setDraft.targetReps,
            targetWeight: setDraft.targetWeight
          });
        }
      }
    }
  );
}

export async function startSession(workoutId: number) {
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
        const exerciseId = exerciseBlock.exercise.id;
        if (!exerciseId) {
          continue;
        }

        for (const set of exerciseBlock.sets) {
          await db.sessionExerciseSets.add({
            sessionId: createdSessionId,
            exerciseId,
            templateSetOrder: set.order,
            targetReps: set.targetReps,
            targetWeight: set.targetWeight,
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

  const exerciseIds = workout.exercises
    .map((block) => block.exercise.id)
    .filter((value): value is number => !!value);

  const sets = exerciseIds.length
    ? await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray()
    : [];

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

  await db.sessionExerciseSets.update(setId, {
    ...patch,
    completedAt: nextCompletedAt
  });
}

export async function completeSession(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  await db.sessions.update(sessionId, {
    status: "completed",
    finishedAt: nowIso()
  });
}

export async function getLastCompletedSetsByExercise(
  workoutId: number,
  beforeSessionId?: number
): Promise<Record<number, LastExerciseSetSnapshot>> {
  const workout = await getWorkoutById(workoutId);
  if (!workout) {
    return {};
  }

  const completedSessions = await db.sessions
    .where("workoutId")
    .equals(workoutId)
    .and((session) => session.status === "completed")
    .reverse()
    .sortBy("finishedAt");

  const sessionCandidates = completedSessions
    .filter((session) => !beforeSessionId || (session.id ?? 0) < beforeSessionId)
    .sort((a, b) => (new Date(b.finishedAt ?? 0).getTime() - new Date(a.finishedAt ?? 0).getTime()));

  const result: Record<number, LastExerciseSetSnapshot> = {};

  for (const session of sessionCandidates) {
    const sessionId = session.id;
    if (!sessionId) {
      continue;
    }

    const sets = await db.sessionExerciseSets.where("sessionId").equals(sessionId).toArray();
    const grouped = new Map<number, SessionExerciseSet[]>();

    for (const set of sets) {
      const current = grouped.get(set.exerciseId) ?? [];
      current.push(set);
      grouped.set(set.exerciseId, current);
    }

    for (const [exerciseId, exerciseSets] of grouped.entries()) {
      if (!result[exerciseId]) {
        result[exerciseId] = {
          exerciseId,
          completedAt: session.finishedAt ?? session.startedAt,
          sets: exerciseSets.sort((a, b) => a.templateSetOrder - b.templateSetOrder)
        };
      }
    }
  }

  return result;
}

export async function importWorkouts(drafts: WorkoutDraft[]) {
  for (const draft of drafts) {
    await createWorkoutRecord(draft);
  }
}

export async function getAllSessionsByWorkout(workoutId: number) {
  return db.sessions
    .where("workoutId")
    .equals(workoutId)
    .reverse()
    .sortBy("startedAt");
}

export async function seedDemoDataIfEmpty() {
  const existingCount = await db.workouts.count();
  if (existingCount > 0) {
    return;
  }

  await createWorkout({
    name: "Upper Body A",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { targetReps: 8, targetWeight: 60 },
          { targetReps: 8, targetWeight: 60 },
          { targetReps: 6, targetWeight: 65 }
        ]
      },
      {
        name: "Row",
        sets: [
          { targetReps: 10, targetWeight: 45 },
          { targetReps: 10, targetWeight: 45 }
        ]
      }
    ]
  });
}

export function formatWeightLabel(weight: number | undefined, unit: WeightUnit) {
  if (weight === undefined) {
    return "-";
  }
  return `${weight} ${unit}`;
}

export type { WorkoutDraft };
