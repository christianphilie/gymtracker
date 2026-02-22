import { z } from "zod";
import type { WorkoutDraft } from "@/db/repository";
import type { AppLanguage } from "@/db/types";

const setSchema = z.object({
  targetReps: z.number().int().positive(),
  targetWeight: z.number().nonnegative()
});

const exerciseSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  sets: z.array(setSchema).min(1)
});

const workoutSchema = z.object({
  name: z.string().min(1),
  exercises: z.array(exerciseSchema).min(1)
});

export const importSchema = z.object({
  schemaVersion: z.literal("1.0"),
  locale: z.enum(["de", "en"]).optional(),
  workouts: z.array(workoutSchema).min(1)
});

export type TrainingPlanImportV1 = z.infer<typeof importSchema>;

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export interface RepairResult {
  repairedObject: TrainingPlanImportV1 | null;
  drafts: WorkoutDraft[];
  changes: string[];
  errors: string[];
}

export function repairImportPayload(raw: unknown): RepairResult {
  const changes: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      repairedObject: null,
      drafts: [],
      changes,
      errors: ["Root JSON must be an object."]
    };
  }

  const source = raw as Record<string, unknown>;

  const schemaVersion = typeof source.schemaVersion === "string" && source.schemaVersion.trim()
    ? source.schemaVersion.trim()
    : "1.0";

  if (source.schemaVersion !== "1.0") {
    changes.push(`schemaVersion missing/invalid -> set to "1.0"`);
  }

  const locale = source.locale === "de" || source.locale === "en" ? source.locale : undefined;
  if (source.locale !== undefined && source.locale !== locale) {
    changes.push("Unsupported locale removed");
  }

  if (!Array.isArray(source.workouts)) {
    errors.push("workouts must be an array");
    return {
      repairedObject: null,
      drafts: [],
      changes,
      errors
    };
  }

  const repairedWorkouts: TrainingPlanImportV1["workouts"] = [];

  source.workouts.forEach((rawWorkout, workoutIndex) => {
    if (!rawWorkout || typeof rawWorkout !== "object") {
      changes.push(`workout[${workoutIndex}] removed (not an object)`);
      return;
    }

    const workoutSource = rawWorkout as Record<string, unknown>;
    const workoutName = typeof workoutSource.name === "string" ? workoutSource.name.trim() : "";

    if (!workoutName) {
      changes.push(`workout[${workoutIndex}] removed (missing name)`);
      return;
    }

    if (!Array.isArray(workoutSource.exercises)) {
      changes.push(`workout[${workoutIndex}] removed (exercises missing)`);
      return;
    }

    const repairedExercises: TrainingPlanImportV1["workouts"][number]["exercises"] = [];

    workoutSource.exercises.forEach((rawExercise, exerciseIndex) => {
      if (!rawExercise || typeof rawExercise !== "object") {
        changes.push(`workout[${workoutIndex}].exercise[${exerciseIndex}] removed (not an object)`);
        return;
      }

      const exerciseSource = rawExercise as Record<string, unknown>;
      const exerciseName = typeof exerciseSource.name === "string" ? exerciseSource.name.trim() : "";
      if (!exerciseName) {
        changes.push(`workout[${workoutIndex}].exercise[${exerciseIndex}] removed (missing name)`);
        return;
      }

      const notes = typeof exerciseSource.notes === "string" ? exerciseSource.notes.trim() : undefined;
      const rawSets = Array.isArray(exerciseSource.sets) ? exerciseSource.sets : [];

      if (rawSets.length === 0) {
        changes.push(`workout[${workoutIndex}].exercise[${exerciseIndex}] removed (no sets)`);
        return;
      }

      const repairedSets: TrainingPlanImportV1["workouts"][number]["exercises"][number]["sets"] = [];

      rawSets.forEach((rawSet, setIndex) => {
        if (!rawSet || typeof rawSet !== "object") {
          changes.push(`set removed at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}] (not object)`);
          return;
        }

        const setSource = rawSet as Record<string, unknown>;
        const rawReps = setSource.targetReps ?? setSource.reps;
        const rawWeight = setSource.targetWeight ?? setSource.weight;
        const repsValue = rawReps === null ? undefined : toNumber(rawReps);
        const weightValue = rawWeight === null ? 0 : toNumber(rawWeight) ?? 0;
        if (setSource.reps !== undefined && setSource.targetReps === undefined) {
          changes.push(`Alias reps -> targetReps at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}]`);
        }

        if (setSource.weight !== undefined && setSource.targetWeight === undefined) {
          changes.push(`Alias weight -> targetWeight at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}]`);
        }

        if (typeof setSource.targetReps === "string" || typeof setSource.reps === "string") {
          changes.push(`String converted to number for reps at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}]`);
        }

        if (typeof setSource.targetWeight === "string" || typeof setSource.weight === "string") {
          changes.push(`String converted to number for weight at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}]`);
        }

        if (repsValue === undefined || repsValue <= 0) {
          changes.push(`set removed at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}] (invalid reps)`);
          return;
        }

        repairedSets.push({
          targetReps: Math.round(Math.abs(repsValue)),
          targetWeight: Math.max(0, Number(weightValue))
        });
      });

      if (repairedSets.length === 0) {
        changes.push(`workout[${workoutIndex}].exercise[${exerciseIndex}] removed (all sets invalid)`);
        return;
      }

      repairedExercises.push({
        name: exerciseName,
        notes,
        sets: repairedSets
      });
    });

    if (repairedExercises.length === 0) {
      changes.push(`workout[${workoutIndex}] removed (no valid exercises)`);
      return;
    }

    repairedWorkouts.push({
      name: workoutName,
      exercises: repairedExercises
    });
  });

  if (repairedWorkouts.length === 0) {
    return {
      repairedObject: null,
      drafts: [],
      changes,
      errors: [...errors, "No valid workouts after repair"]
    };
  }

  const candidate = {
    schemaVersion: "1.0" as const,
    locale,
    workouts: repairedWorkouts
  };

  const validation = importSchema.safeParse(candidate);
  if (!validation.success) {
    return {
      repairedObject: null,
      drafts: [],
      changes,
      errors: validation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  const drafts: WorkoutDraft[] = validation.data.workouts.map((workout) => ({
    name: workout.name,
    exercises: workout.exercises.map((exercise) => ({
      name: exercise.name,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        targetReps: set.targetReps,
        targetWeight: set.targetWeight
      }))
    }))
  }));

  return {
    repairedObject: validation.data,
    drafts,
    changes,
    errors
  };
}

export function getPromptTemplate(language: AppLanguage) {
  if (language === "de") {
    return `Du bist ein Datenkonverter. Konvertiere den Trainingsplan in valides JSON nach diesem Schema. Gib ausschließlich das rohe JSON zurück – kein Markdown, keine Code-Blöcke, keine Erklärungen.

Regeln:
1) schemaVersion muss exakt "1.0" sein.
2) targetReps und targetWeight müssen Zahlen sein (kein String, kein null).
3) targetWeight darf 0 sein, wenn kein Gewicht angegeben ist.
4) Das Feld "notes" nur einfügen, wenn wirklich eine Anmerkung vorhanden ist – sonst weglassen.
5) Nur die Felder aus dem Schema verwenden – keine Extrafelder.
6) Jede Übung braucht mindestens einen Satz.

Schema:
{
  "schemaVersion": "1.0",
  "locale": "de",
  "workouts": [
    {
      "name": "Oberkörper A",
      "exercises": [
        {
          "name": "Bankdrücken",
          "sets": [
            { "targetReps": 8, "targetWeight": 60 },
            { "targetReps": 8, "targetWeight": 60 }
          ]
        },
        {
          "name": "Klimmzüge",
          "notes": "Mit Zusatzgewicht",
          "sets": [
            { "targetReps": 6, "targetWeight": 10 }
          ]
        }
      ]
    }
  ]
}`;
  }

  return `You are a data converter. Convert the workout plan into valid JSON using this schema. Return only raw JSON – no markdown, no code blocks, no explanations.

Rules:
1) schemaVersion must be exactly "1.0".
2) targetReps and targetWeight must be numbers (not strings, not null).
3) targetWeight may be 0 if no weight is specified.
4) Only include the "notes" field if there is an actual note – omit it otherwise.
5) Use only the schema fields – no extra fields.
6) Every exercise needs at least one set.

Schema:
{
  "schemaVersion": "1.0",
  "locale": "en",
  "workouts": [
    {
      "name": "Upper Body A",
      "exercises": [
        {
          "name": "Bench Press",
          "sets": [
            { "targetReps": 8, "targetWeight": 60 },
            { "targetReps": 8, "targetWeight": 60 }
          ]
        },
        {
          "name": "Pull-ups",
          "notes": "With added weight",
          "sets": [
            { "targetReps": 6, "targetWeight": 10 }
          ]
        }
      ]
    }
  ]
}`;
}
