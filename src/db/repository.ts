import { db } from "@/db/db";
import { ensureDefaultSettings } from "@/db/repository-settings";
import type {
  Exercise,
  ExerciseTemplateSet,
  PreviousSessionSummary,
  Session,
  SessionExerciseSet,
  WeightUnit,
  Workout,
  WorkoutWithRelations
} from "@/db/types";

export {
  ensureDefaultSettings,
  getSettings,
  updateColorScheme,
  updateLockerNoteEnabled,
  updateLockerNumber,
  updateRestTimerEnabled,
  updateRestTimerSeconds,
  updateSettings,
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

interface WorkoutDraft {
  name: string;
  icon?: Workout["icon"];
  exercises: Array<{
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

function nowIso() {
  return new Date().toISOString();
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
    icon: draft.icon,
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
        icon: draft.icon,
        updatedAt: nowIso()
      });

      const currentTemplateExercises = await db.exercises
        .where("workoutId")
        .equals(workoutId)
        .and((exercise) => exercise.isTemplate !== false)
        .toArray();

      const currentTemplateExerciseIds = currentTemplateExercises
        .map((exercise) => exercise.id)
        .filter((value): value is number => !!value);

      if (currentTemplateExerciseIds.length) {
        await db.exerciseTemplateSets.where("exerciseId").anyOf(currentTemplateExerciseIds).delete();
        await db.exercises.where("id").anyOf(currentTemplateExerciseIds).delete();
      }

      for (let exerciseIndex = 0; exerciseIndex < draft.exercises.length; exerciseIndex += 1) {
        const exerciseDraft = draft.exercises[exerciseIndex];
        const exerciseId = await db.exercises.add({
          workoutId,
          name: exerciseDraft.name.trim(),
          notes: exerciseDraft.notes?.trim(),
          aiInfo: exerciseDraft.aiInfo,
          order: exerciseIndex,
          isTemplate: true,
          x2Enabled: exerciseDraft.x2Enabled ?? false,
          negativeWeightEnabled: exerciseDraft.negativeWeightEnabled ?? false,
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

  await createWorkout({
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
  });

  await createWorkout({
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
  });
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
            targetWeight: set.targetWeight,
            actualReps: set.targetReps,
            actualWeight: set.targetWeight,
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

  await db.sessionExerciseSets.update(setId, {
    ...patch,
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
  const targetWeight = lastSet.actualWeight ?? lastSet.targetWeight;

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
    .map((exerciseSets) => exerciseSets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
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
        createdAt: now,
        updatedAt: now
      });

      for (let setIndex = 0; setIndex < exerciseSets.length; setIndex += 1) {
        const set = exerciseSets[setIndex];
        await db.exerciseTemplateSets.add({
          exerciseId,
          order: setIndex,
          targetReps: set.actualReps ?? set.targetReps,
          targetWeight: set.actualWeight ?? set.targetWeight
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
      .sort((a, b) => a.templateSetOrder - b.templateSetOrder);

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
          templateSetOrder: draft.templateSetOrder,
          actualReps: draft.actualReps,
          actualWeight: draft.actualWeight,
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
        templateSetOrder: draft.templateSetOrder,
        targetReps: draft.actualReps,
        targetWeight: draft.actualWeight,
        actualReps: draft.actualReps,
        actualWeight: draft.actualWeight,
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
  const existingCount = await db.workouts.count();
  if (existingCount > 0) {
    return;
  }

  await createWorkout({
    name: "Upper Body A",
    icon: "dumbbell",
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
