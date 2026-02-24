import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  ExerciseTemplateSet,
  Session,
  SessionExerciseSet,
  Settings,
  UpdateSafetySnapshot,
  Workout
} from "@/db/types";

class GymTrackerDB extends Dexie {
  settings!: Table<Settings, number>;
  workouts!: Table<Workout, number>;
  exercises!: Table<Exercise, number>;
  exerciseTemplateSets!: Table<ExerciseTemplateSet, number>;
  sessions!: Table<Session, number>;
  sessionExerciseSets!: Table<SessionExerciseSet, number>;
  updateSafetySnapshots!: Table<UpdateSafetySnapshot, number>;

  constructor() {
    super("gymtracker");

    this.version(1).stores({
      settings: "id, language, weightUnit",
      workouts: "++id, name, createdAt, updatedAt",
      exercises: "++id, workoutId, name, order",
      exerciseTemplateSets: "++id, exerciseId, order",
      sessions: "++id, workoutId, status, startedAt, finishedAt",
      sessionExerciseSets: "++id, sessionId, exerciseId, completed"
    });

    this.version(2)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed"
      })
      .upgrade(async (tx) => {
        const exercises = await tx.table("exercises").toArray();
        const exerciseById = new Map<number, Record<string, unknown>>();
        for (const exercise of exercises as Array<Record<string, unknown>>) {
          const id = exercise.id as number | undefined;
          if (id !== undefined) {
            exerciseById.set(id, exercise);
          }
        }

        await tx.table("exercises").toCollection().modify((exercise: Record<string, unknown>) => {
          if (exercise.isTemplate === undefined) {
            exercise.isTemplate = true;
          }
        });

        await tx.table("sessionExerciseSets").toCollection().modify((set: Record<string, unknown>) => {
          const templateExerciseId = set.exerciseId as number | undefined;
          const sourceExercise =
            templateExerciseId !== undefined ? exerciseById.get(templateExerciseId) : undefined;

          set.templateExerciseId = templateExerciseId;
          set.sessionExerciseKey =
            templateExerciseId !== undefined ? `template-${templateExerciseId}` : `legacy-${set.id}`;
          set.exerciseName = (sourceExercise?.name as string | undefined) ?? "Exercise";
          set.exerciseNotes = (sourceExercise?.notes as string | undefined) ?? "";
          set.exerciseOrder = (sourceExercise?.order as number | undefined) ?? 0;
          set.isTemplateExercise = templateExerciseId !== undefined;

          if (set.actualReps === undefined) {
            set.actualReps = set.targetReps;
          }

          if (set.actualWeight === undefined) {
            set.actualWeight = set.targetWeight;
          }

          delete set.exerciseId;
        });
      });

    this.version(3).stores({
      settings: "id, language, weightUnit",
      workouts: "++id, name, createdAt, updatedAt",
      exercises: "++id, workoutId, name, order, isTemplate",
      exerciseTemplateSets: "++id, exerciseId, order",
      sessions: "++id, workoutId, status, startedAt, finishedAt",
      sessionExerciseSets:
        "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed",
      updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
    });

    this.version(4)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed",
        updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
      })
      .upgrade(async (tx) => {
        await tx.table("settings").toCollection().modify((settings: Record<string, unknown>) => {
          if (settings.restTimerSeconds === undefined) {
            settings.restTimerSeconds = 120;
          }
        });
      });

    this.version(5)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed",
        updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
      })
      .upgrade(async (tx) => {
        await tx.table("settings").toCollection().modify((settings: Record<string, unknown>) => {
          if (settings.colorScheme === undefined) {
            settings.colorScheme = "system";
          }
        });
      });

    this.version(6)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate, x2Enabled",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed, x2Enabled",
        updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
      })
      .upgrade(async (tx) => {
        await tx.table("settings").toCollection().modify((settings: Record<string, unknown>) => {
          if (settings.lockerNumber === undefined) {
            settings.lockerNumber = "";
          }
          if (settings.lockerNumberUpdatedAt === undefined) {
            settings.lockerNumberUpdatedAt = "";
          }
        });

        await tx.table("exercises").toCollection().modify((exercise: Record<string, unknown>) => {
          if (exercise.x2Enabled === undefined) {
            exercise.x2Enabled = false;
          }
        });

        await tx.table("sessionExerciseSets").toCollection().modify((set: Record<string, unknown>) => {
          if (set.x2Enabled === undefined) {
            set.x2Enabled = false;
          }
        });
      });

    this.version(7)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed",
        updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
      })
      .upgrade(async (tx) => {
        await tx.table("exercises").toCollection().modify((exercise: Record<string, unknown>) => {
          delete exercise.x2Enabled;
        });

        await tx.table("sessionExerciseSets").toCollection().modify((set: Record<string, unknown>) => {
          delete set.x2Enabled;
        });
      });

    this.version(8)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed",
        updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
      })
      .upgrade(async (tx) => {
        await tx.table("settings").toCollection().modify((settings: Record<string, unknown>) => {
          const legacyRestTimerSeconds = typeof settings.restTimerSeconds === "number" ? settings.restTimerSeconds : undefined;
          if (settings.restTimerEnabled === undefined) {
            settings.restTimerEnabled = legacyRestTimerSeconds === 0 ? false : true;
          }
          if (legacyRestTimerSeconds === 0) {
            settings.restTimerSeconds = 120;
          }
          if (typeof settings.restTimerSeconds !== "number" || ![60, 120, 180, 300].includes(settings.restTimerSeconds as number)) {
            settings.restTimerSeconds = 120;
          }
          if (settings.lockerNoteEnabled === undefined) {
            settings.lockerNoteEnabled = true;
          }
        });
      });

    this.version(9)
      .stores({
        settings: "id, language, weightUnit",
        workouts: "++id, name, createdAt, updatedAt",
        exercises: "++id, workoutId, name, order, isTemplate, x2Enabled",
        exerciseTemplateSets: "++id, exerciseId, order",
        sessions: "++id, workoutId, status, startedAt, finishedAt",
        sessionExerciseSets:
          "++id, sessionId, templateExerciseId, sessionExerciseKey, isTemplateExercise, completed, x2Enabled",
        updateSafetySnapshots: "++id, createdAt, appVersion, previousAppVersion"
      })
      .upgrade(async (tx) => {
        await tx.table("exercises").toCollection().modify((exercise: Record<string, unknown>) => {
          if (exercise.x2Enabled === undefined) {
            exercise.x2Enabled = false;
          }
        });

        await tx.table("sessionExerciseSets").toCollection().modify((set: Record<string, unknown>) => {
          if (set.x2Enabled === undefined) {
            set.x2Enabled = false;
          }
        });
      });

  }
}

export const db = new GymTrackerDB();
