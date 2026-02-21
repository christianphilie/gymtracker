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
  }
}

export const db = new GymTrackerDB();
