export type AppLanguage = "de" | "en";
export type WeightUnit = "kg" | "lb";

export interface Settings {
  id: number;
  language: AppLanguage;
  weightUnit: WeightUnit;
  createdAt: string;
  updatedAt: string;
}

export interface Workout {
  id?: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface Exercise {
  id?: number;
  workoutId: number;
  name: string;
  notes?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseTemplateSet {
  id?: number;
  exerciseId: number;
  order: number;
  targetReps: number;
  targetWeight: number;
}

export type SessionStatus = "active" | "completed";

export interface Session {
  id?: number;
  workoutId: number;
  startedAt: string;
  finishedAt?: string;
  status: SessionStatus;
  createdAt: string;
}

export interface SessionExerciseSet {
  id?: number;
  sessionId: number;
  exerciseId: number;
  templateSetOrder: number;
  targetReps: number;
  targetWeight: number;
  actualReps?: number;
  actualWeight?: number;
  completed: boolean;
  completedAt?: string;
}

export interface WorkoutWithRelations {
  workout: Workout;
  exercises: Array<{
    exercise: Exercise;
    sets: ExerciseTemplateSet[];
  }>;
}

export interface LastExerciseSetSnapshot {
  exerciseId: number;
  completedAt: string;
  sets: SessionExerciseSet[];
}
