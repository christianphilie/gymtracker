import {
  APP_VERSION,
  LAST_SEEN_APP_VERSION_KEY,
  MAX_UPDATE_SAFETY_SNAPSHOTS
} from "@/app/version";
import { db } from "@/db/db";
import { ensureDefaultSettings } from "@/db/repository-settings";
import type {
  Exercise,
  ExerciseTemplateSet,
  Session,
  SessionExerciseSet,
  Settings,
  UpdateSafetySnapshot,
  Workout
} from "@/db/types";

export interface AppDataSnapshot {
  settings: Settings[];
  workouts: Array<Workout & { id: number }>;
  exercises: Array<Exercise & { id: number }>;
  exerciseTemplateSets: Array<ExerciseTemplateSet & { id: number }>;
  sessions: Array<Session & { id: number }>;
  sessionExerciseSets: Array<SessionExerciseSet & { id: number }>;
}

function nowIso() {
  return new Date().toISOString();
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

function clearGymtrackerLocalStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key.startsWith("gymtracker:")) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
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

  clearGymtrackerLocalStorage();
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
