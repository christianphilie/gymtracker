import {
  APP_VERSION,
  LAST_SEEN_APP_VERSION_KEY,
  MAX_UPDATE_SAFETY_SNAPSHOTS
} from "@/app/version";
import { db } from "@/db/db";
import type {
  ColorScheme,
  Exercise,
  ExerciseTemplateSet,
  PreviousSessionSummary,
  Session,
  SessionExerciseSet,
  Settings,
  UpdateSafetySnapshot,
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

export interface AppDataSnapshot {
  settings: Settings[];
  workouts: Array<Workout & { id: number }>;
  exercises: Array<Exercise & { id: number }>;
  exerciseTemplateSets: Array<ExerciseTemplateSet & { id: number }>;
  sessions: Array<Session & { id: number }>;
  sessionExerciseSets: Array<SessionExerciseSet & { id: number }>;
}

const SETTINGS_ID = 1;

function convertWeightValue(value: number, from: WeightUnit, to: WeightUnit) {
  if (from === to) {
    return value;
  }

  const converted = from === "kg" ? value * 2.2046226218 : value / 2.2046226218;
  return Math.round(converted * 10) / 10;
}

function isAppDataSnapshot(value: unknown): value is AppDataSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.settings) &&
    Array.isArray(candidate.workouts) &&
    Array.isArray(candidate.exercises) &&
    Array.isArray(candidate.exerciseTemplateSets) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.sessionExerciseSets)
  );
}

function hasSnapshotData(snapshot: AppDataSnapshot) {
  return (
    snapshot.settings.length > 0 ||
    snapshot.workouts.length > 0 ||
    snapshot.exercises.length > 0 ||
    snapshot.exerciseTemplateSets.length > 0 ||
    snapshot.sessions.length > 0 ||
    snapshot.sessionExerciseSets.length > 0
  );
}

export async function createUpdateSafetySnapshotIfNeeded() {
  const previousVersion = localStorage.getItem(LAST_SEEN_APP_VERSION_KEY);
  if (!previousVersion || previousVersion === APP_VERSION) {
    localStorage.setItem(LAST_SEEN_APP_VERSION_KEY, APP_VERSION);
    return null;
  }

  const snapshot = await exportAllDataSnapshot();
  if (!hasSnapshotData(snapshot)) {
    localStorage.setItem(LAST_SEEN_APP_VERSION_KEY, APP_VERSION);
    return null;
  }

  const record: UpdateSafetySnapshot = {
    appVersion: APP_VERSION,
    previousAppVersion: previousVersion,
    createdAt: nowIso(),
    snapshotJson: JSON.stringify(snapshot)
  };

  const id = await db.updateSafetySnapshots.add(record);
  const oldRecords = await db.updateSafetySnapshots.orderBy("createdAt").toArray();
  const overflow = oldRecords.slice(0, Math.max(0, oldRecords.length - MAX_UPDATE_SAFETY_SNAPSHOTS));

  if (overflow.length) {
    const overflowIds = overflow.map((entry) => entry.id).filter((value): value is number => value !== undefined);
    if (overflowIds.length) {
      await db.updateSafetySnapshots.bulkDelete(overflowIds);
    }
  }

  localStorage.setItem(LAST_SEEN_APP_VERSION_KEY, APP_VERSION);

  return { ...record, id };
}

export async function getLatestUpdateSafetySnapshot() {
  return db.updateSafetySnapshots.orderBy("createdAt").last();
}

export async function restoreUpdateSafetySnapshot(snapshotId: number) {
  const snapshot = await db.updateSafetySnapshots.get(snapshotId);
  if (!snapshot) {
    throw new Error("Safety snapshot not found");
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(snapshot.snapshotJson);
  } catch {
    throw new Error("Safety snapshot payload is corrupted");
  }

  if (!isAppDataSnapshot(parsedRaw)) {
    throw new Error("Safety snapshot payload has invalid structure");
  }

  await importAllDataSnapshot(parsedRaw);
  return snapshot;
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

export async function ensureDefaultSettings() {
  const existing = await db.settings.get(SETTINGS_ID);
  if (existing) {
    const patch: Partial<Settings> = {};
    if (existing.restTimerSeconds === undefined) {
      patch.restTimerSeconds = 120;
    }
    if (existing.colorScheme === undefined) {
      patch.colorScheme = "system";
    }
    if (existing.lockerNumber === undefined) {
      patch.lockerNumber = "";
    }
    if (existing.lockerNumberUpdatedAt === undefined) {
      patch.lockerNumberUpdatedAt = "";
    }
    if (Object.keys(patch).length > 0) {
      const patched: Settings = { ...existing, ...patch, updatedAt: nowIso() };
      await db.settings.put(patched);
      return patched;
    }
    return existing;
  }

  const now = nowIso();
  const defaults: Settings = {
    id: SETTINGS_ID,
    language: "de",
    weightUnit: "kg",
    restTimerSeconds: 120,
    lockerNumber: "",
    lockerNumberUpdatedAt: "",
    colorScheme: "system",
    createdAt: now,
    updatedAt: now
  };

  await db.settings.put(defaults);
  return defaults;
}

export async function updateSettings(
  patch: Partial<Pick<Settings, "language" | "weightUnit" | "restTimerSeconds" | "colorScheme" | "lockerNumber" | "lockerNumberUpdatedAt">>
) {
  const current = await ensureDefaultSettings();
  const next: Settings = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };
  await db.settings.put(next);
  return next;
}

export async function updateRestTimerSeconds(seconds: number) {
  const clamped = seconds <= 0 ? 0 : seconds <= 120 ? 120 : seconds <= 180 ? 180 : 300;
  return updateSettings({ restTimerSeconds: clamped });
}

export async function updateLockerNumber(lockerNumber: string) {
  return updateSettings({
    lockerNumber: lockerNumber.trim(),
    lockerNumberUpdatedAt: nowIso()
  });
}

export async function updateColorScheme(scheme: ColorScheme) {
  return updateSettings({ colorScheme: scheme });
}

export async function updateWeightUnitAndConvert(nextUnit: WeightUnit) {
  await ensureDefaultSettings();

  await db.transaction(
    "rw",
    [db.settings, db.exerciseTemplateSets, db.sessionExerciseSets],
    async () => {
      const currentSettings = (await db.settings.get(SETTINGS_ID)) ?? (await ensureDefaultSettings());
      if (currentSettings.weightUnit === nextUnit) {
        return;
      }

      const templateSets = await db.exerciseTemplateSets.toArray();
      for (const set of templateSets) {
        if (set.id === undefined) {
          continue;
        }

        await db.exerciseTemplateSets.update(set.id, {
          targetWeight: convertWeightValue(set.targetWeight, currentSettings.weightUnit, nextUnit)
        });
      }

      const sessionSets = await db.sessionExerciseSets.toArray();
      for (const set of sessionSets) {
        if (set.id === undefined) {
          continue;
        }

        await db.sessionExerciseSets.update(set.id, {
          targetWeight: convertWeightValue(set.targetWeight, currentSettings.weightUnit, nextUnit),
          actualWeight:
            set.actualWeight === undefined
              ? undefined
              : convertWeightValue(set.actualWeight, currentSettings.weightUnit, nextUnit)
        });
      }

      await db.settings.put({
        ...currentSettings,
        weightUnit: nextUnit,
        updatedAt: nowIso()
      });
    }
  );

  return db.settings.get(SETTINGS_ID);
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
      isTemplate: true,
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
          order: exerciseIndex,
          isTemplate: true,
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
    name: "Ganzkörpertraining",
    exercises: [
      {
        name: "Beinpresse",
        sets: [
          { targetReps: 12, targetWeight: 50 },
          { targetReps: 12, targetWeight: 50 },
          { targetReps: 12, targetWeight: 50 }
        ]
      },
      {
        name: "Brustpresse (Maschine)",
        sets: [
          { targetReps: 12, targetWeight: 30 },
          { targetReps: 12, targetWeight: 30 },
          { targetReps: 12, targetWeight: 30 }
        ]
      },
      {
        name: "Latzug (Maschine)",
        sets: [
          { targetReps: 12, targetWeight: 40 },
          { targetReps: 12, targetWeight: 40 },
          { targetReps: 12, targetWeight: 40 }
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
        name: "Bizepscurl (Maschine)",
        sets: [
          { targetReps: 12, targetWeight: 15 },
          { targetReps: 12, targetWeight: 15 },
          { targetReps: 12, targetWeight: 15 }
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
}

export async function clearAllData() {
  await db.transaction(
    "rw",
    [db.settings, db.workouts, db.exercises, db.exerciseTemplateSets, db.sessions, db.sessionExerciseSets, db.updateSafetySnapshots],
    async () => {
      await db.sessionExerciseSets.clear();
      await db.sessions.clear();
      await db.exerciseTemplateSets.clear();
      await db.exercises.clear();
      await db.workouts.clear();
      await db.settings.clear();
      await db.updateSafetySnapshots.clear();
    }
  );
}

export async function exportAllDataSnapshot(): Promise<AppDataSnapshot> {
  const [settings, workouts, exercises, exerciseTemplateSets, sessions, sessionExerciseSets] =
    await Promise.all([
      db.settings.toArray(),
      db.workouts.toArray(),
      db.exercises.toArray(),
      db.exerciseTemplateSets.toArray(),
      db.sessions.toArray(),
      db.sessionExerciseSets.toArray()
    ]);

  const persistedWorkouts = workouts.filter(
    (workout): workout is Workout & { id: number } => workout.id !== undefined
  );
  const persistedExercises = exercises.filter(
    (exercise): exercise is Exercise & { id: number } => exercise.id !== undefined
  );
  const persistedTemplateSets = exerciseTemplateSets.filter(
    (set): set is ExerciseTemplateSet & { id: number } => set.id !== undefined
  );
  const persistedSessions = sessions.filter(
    (session): session is Session & { id: number } => session.id !== undefined
  );
  const persistedSessionSets = sessionExerciseSets.filter(
    (set): set is SessionExerciseSet & { id: number } => set.id !== undefined
  );

  if (
    persistedWorkouts.length !== workouts.length ||
    persistedExercises.length !== exercises.length ||
    persistedTemplateSets.length !== exerciseTemplateSets.length ||
    persistedSessions.length !== sessions.length ||
    persistedSessionSets.length !== sessionExerciseSets.length
  ) {
    throw new Error("Backup export failed: some records are missing primary keys.");
  }

  return {
    settings,
    workouts: persistedWorkouts,
    exercises: persistedExercises,
    exerciseTemplateSets: persistedTemplateSets,
    sessions: persistedSessions,
    sessionExerciseSets: persistedSessionSets
  };
}

export async function importAllDataSnapshot(snapshot: AppDataSnapshot) {
  await db.transaction(
    "rw",
    [db.settings, db.workouts, db.exercises, db.exerciseTemplateSets, db.sessions, db.sessionExerciseSets],
    async () => {
      await db.sessionExerciseSets.clear();
      await db.sessions.clear();
      await db.exerciseTemplateSets.clear();
      await db.exercises.clear();
      await db.workouts.clear();
      await db.settings.clear();

      if (snapshot.settings.length) {
        await db.settings.bulkPut(snapshot.settings);
      }
      if (snapshot.workouts.length) {
        await db.workouts.bulkPut(snapshot.workouts);
      }
      if (snapshot.exercises.length) {
        await db.exercises.bulkPut(snapshot.exercises);
      }
      if (snapshot.exerciseTemplateSets.length) {
        await db.exerciseTemplateSets.bulkPut(snapshot.exerciseTemplateSets);
      }
      if (snapshot.sessions.length) {
        await db.sessions.bulkPut(snapshot.sessions);
      }
      if (snapshot.sessionExerciseSets.length) {
        await db.sessionExerciseSets.bulkPut(snapshot.sessionExerciseSets);
      }
    }
  );

  await ensureDefaultSettings();
}

export async function startSession(workoutId: number) {
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
            exerciseOrder: exerciseBlock.exercise.order,
            isTemplateExercise: true,
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
    exerciseOrder: firstSet.exerciseOrder,
    isTemplateExercise: firstSet.isTemplateExercise,
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
    exerciseOrder: maxOrder + 1,
    isTemplateExercise: false,
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
        order: exerciseIndex,
        isTemplate: true,
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

  await db.sessions.update(sessionId, {
    status: "completed",
    finishedAt: nowIso()
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
  const extraExercises: Array<{ name: string; setCount: number }> = [];

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
      setCount: sortedCompleted.length
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
  id: number;
  actualReps: number;
  actualWeight: number;
  completed: boolean;
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

export async function updateCompletedSessionSets(sessionId: number, updates: SessionSetUpdateDraft[]) {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== "completed") {
    throw new Error("Completed session not found");
  }

  await db.transaction("rw", db.sessionExerciseSets, async () => {
    for (const draft of updates) {
      const current = await db.sessionExerciseSets.get(draft.id);
      if (!current || current.sessionId !== sessionId) {
        continue;
      }

      await db.sessionExerciseSets.update(draft.id, {
        actualReps: draft.actualReps,
        actualWeight: draft.actualWeight,
        completed: draft.completed,
        completedAt: draft.completed ? current.completedAt ?? nowIso() : undefined
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
