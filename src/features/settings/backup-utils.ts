import { z } from "zod";
import { APP_DATA_EXPORT_VERSION, DB_SCHEMA_VERSION } from "@/app/version";
import type { AppDataSnapshot } from "@/db/repository";

const settingsSchema = z.object({
  id: z.number().int(),
  language: z.enum(["de", "en"]),
  weightUnit: z.enum(["kg", "lb"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const workoutSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().nullable().optional()
});

const exerciseSchema = z.object({
  id: z.number().int(),
  workoutId: z.number().int(),
  name: z.string().min(1),
  notes: z.string().optional(),
  order: z.number().int(),
  isTemplate: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const exerciseTemplateSetSchema = z.object({
  id: z.number().int(),
  exerciseId: z.number().int(),
  order: z.number().int(),
  targetReps: z.number().int().positive(),
  targetWeight: z.number().nonnegative()
});

const sessionSchema = z.object({
  id: z.number().int(),
  workoutId: z.number().int(),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1).optional(),
  status: z.enum(["active", "completed"]),
  createdAt: z.string().min(1)
});

const sessionExerciseSetSchema = z.object({
  id: z.number().int(),
  sessionId: z.number().int(),
  templateExerciseId: z.number().int().optional(),
  sessionExerciseKey: z.string().min(1),
  exerciseName: z.string().min(1),
  exerciseNotes: z.string().optional(),
  exerciseOrder: z.number().int(),
  isTemplateExercise: z.boolean(),
  templateSetOrder: z.number().int(),
  targetReps: z.number().int().positive(),
  targetWeight: z.number().nonnegative(),
  actualReps: z.number().int().positive().optional(),
  actualWeight: z.number().nonnegative().optional(),
  completed: z.boolean(),
  completedAt: z.string().min(1).optional()
});

const snapshotSchema = z.object({
  settings: z.array(settingsSchema),
  workouts: z.array(workoutSchema),
  exercises: z.array(exerciseSchema),
  exerciseTemplateSets: z.array(exerciseTemplateSetSchema),
  sessions: z.array(sessionSchema),
  sessionExerciseSets: z.array(sessionExerciseSetSchema)
});

const backupSchema = z.object({
  backupVersion: z.literal(APP_DATA_EXPORT_VERSION),
  appVersion: z.string().min(1),
  dbSchemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  data: snapshotSchema
});

export type AppBackupFile = z.infer<typeof backupSchema>;

export function createBackupPayload(snapshot: AppDataSnapshot, appVersion: string): AppBackupFile {
  return {
    backupVersion: APP_DATA_EXPORT_VERSION,
    appVersion,
    dbSchemaVersion: DB_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: snapshot
  };
}

export function parseBackupPayload(raw: unknown) {
  return backupSchema.safeParse(raw);
}
