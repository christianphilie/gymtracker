export type AppLanguage = "de" | "en";
export type WeightUnit = "kg" | "lb";
export type ColorScheme = "light" | "dark" | "system";

export interface Settings {
  id: number;
  language: AppLanguage;
  weightUnit: WeightUnit;
  restTimerSeconds?: number;
  restTimerEnabled?: boolean;
  bodyWeight?: number;
  weeklyWeightGoal?: number;
  weeklyCaloriesGoal?: number;
  weeklyWorkoutCountGoal?: number;
  lockerNoteEnabled?: boolean;
  lockerNumber?: string;
  lockerNumberUpdatedAt?: string;
  colorScheme?: ColorScheme;
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
  isTemplate?: boolean;
  x2Enabled?: boolean;
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
  templateExerciseId?: number;
  sessionExerciseKey: string;
  exerciseName: string;
  exerciseNotes?: string;
  exerciseOrder: number;
  isTemplateExercise: boolean;
  x2Enabled?: boolean;
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
  templateExerciseId: number;
  completedAt: string;
  sets: SessionExerciseSet[];
}

export interface UpdateSafetySnapshot {
  id?: number;
  appVersion: string;
  previousAppVersion?: string;
  createdAt: string;
  snapshotJson: string;
}

export interface PreviousSessionSummary {
  completedAt: string;
  templateExerciseSets: Record<number, SessionExerciseSet[]>;
  extraExercises: Array<{
    name: string;
    setCount: number;
  }>;
}
