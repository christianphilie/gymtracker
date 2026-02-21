import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  ExerciseTemplateSet,
  Session,
  SessionExerciseSet,
  Settings,
  Workout
} from "@/db/types";

class GymTrackerDB extends Dexie {
  settings!: Table<Settings, number>;
  workouts!: Table<Workout, number>;
  exercises!: Table<Exercise, number>;
  exerciseTemplateSets!: Table<ExerciseTemplateSet, number>;
  sessions!: Table<Session, number>;
  sessionExerciseSets!: Table<SessionExerciseSet, number>;

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
  }
}

export const db = new GymTrackerDB();
