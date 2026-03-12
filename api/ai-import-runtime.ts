type AppLanguage = "de" | "en";
type WorkoutIconKey =
  | "dumbbell"
  | "target"
  | "flame"
  | "zap"
  | "heart-pulse"
  | "shield"
  | "footprints"
  | "mountain"
  | "activity"
  | "repeat"
  | "arrow-up"
  | "arrow-down"
  | "arrow-right"
  | "arrow-left"
  | "arrow-left-right"
  | "chevrons-up"
  | "chevrons-down"
  | "shirt"
  | "person-standing"
  | "swords";

const IMPORT_ICON_KEYS: WorkoutIconKey[] = [
  "dumbbell",
  "target",
  "flame",
  "zap",
  "heart-pulse",
  "shield",
  "footprints",
  "mountain",
  "activity",
  "repeat",
  "arrow-up",
  "arrow-down",
  "arrow-right",
  "arrow-left",
  "arrow-left-right",
  "chevrons-up",
  "chevrons-down",
  "shirt",
  "person-standing",
  "swords"
];

function normalizeWorkoutIconKey(value: unknown): WorkoutIconKey | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return IMPORT_ICON_KEYS.includes(normalized as WorkoutIconKey)
    ? (normalized as WorkoutIconKey)
    : undefined;
}

export interface TrainingPlanImportV1 {
  schemaVersion: "1.0";
  locale?: "de" | "en";
  workouts: Array<{
    name: string;
    icon?: WorkoutIconKey;
    exercises: Array<{
      name: string;
      notes?: string;
      x2Enabled?: boolean;
      negativeWeightEnabled?: boolean;
      sets: Array<{
        targetReps: number;
        targetWeight: number;
      }>;
    }>;
  }>;
}

const importIconKeyList = IMPORT_ICON_KEYS.join(", ");

export const trainingPlanImportResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "workouts"],
  properties: {
    schemaVersion: {
      type: "string",
      enum: ["1.0"]
    },
    locale: {
      type: "string",
      enum: ["de", "en"]
    },
    workouts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "exercises"],
        properties: {
          name: { type: "string", minLength: 1 },
          icon: {
            type: "string",
            enum: IMPORT_ICON_KEYS
          },
          exercises: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "sets"],
              properties: {
                name: { type: "string", minLength: 1 },
                notes: { type: "string" },
                x2Enabled: { type: "boolean" },
                negativeWeightEnabled: { type: "boolean" },
                sets: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["targetReps", "targetWeight"],
                    properties: {
                      targetReps: { type: "integer", minimum: 1 },
                      targetWeight: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

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

function isValidLocale(value: unknown): value is "de" | "en" {
  return value === "de" || value === "en";
}

export interface RepairResult {
  repairedObject: TrainingPlanImportV1 | null;
  drafts: TrainingPlanImportV1["workouts"];
  changes: string[];
  errors: string[];
}

function validateCandidate(candidate: {
  schemaVersion: "1.0";
  locale?: "de" | "en";
  workouts: TrainingPlanImportV1["workouts"];
}): string[] {
  const errors: string[] = [];

  if (candidate.schemaVersion !== "1.0") {
    errors.push('schemaVersion: must be "1.0"');
  }

  if (candidate.locale !== undefined && !isValidLocale(candidate.locale)) {
    errors.push("locale: must be de or en");
  }

  if (!Array.isArray(candidate.workouts) || candidate.workouts.length === 0) {
    errors.push("workouts: must contain at least one workout");
    return errors;
  }

  candidate.workouts.forEach((workout, workoutIndex) => {
    if (!workout.name.trim()) {
      errors.push(`workouts.${workoutIndex}.name: required`);
    }
    if (workout.icon !== undefined && !normalizeWorkoutIconKey(workout.icon)) {
      errors.push(`workouts.${workoutIndex}.icon: invalid`);
    }
    if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) {
      errors.push(`workouts.${workoutIndex}.exercises: must contain at least one exercise`);
      return;
    }

    workout.exercises.forEach((exercise, exerciseIndex) => {
      if (!exercise.name.trim()) {
        errors.push(`workouts.${workoutIndex}.exercises.${exerciseIndex}.name: required`);
      }
      if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
        errors.push(`workouts.${workoutIndex}.exercises.${exerciseIndex}.sets: must contain at least one set`);
        return;
      }

      exercise.sets.forEach((set, setIndex) => {
        if (!Number.isInteger(set.targetReps) || set.targetReps <= 0) {
          errors.push(`workouts.${workoutIndex}.exercises.${exerciseIndex}.sets.${setIndex}.targetReps: invalid`);
        }
        if (typeof set.targetWeight !== "number" || !Number.isFinite(set.targetWeight)) {
          errors.push(`workouts.${workoutIndex}.exercises.${exerciseIndex}.sets.${setIndex}.targetWeight: invalid`);
        }
      });
    });
  });

  return errors;
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
  let normalizedWorkoutsSource: unknown[] | undefined;
  let normalizationMode:
    | "direct-array"
    | "single-workout-in-workouts"
    | "single-workout-root"
    | "nested-data"
    | "root-array"
    | undefined;

  if (Array.isArray(source.workouts)) {
    normalizedWorkoutsSource = source.workouts;
    normalizationMode = "direct-array";
  } else if (source.workouts && typeof source.workouts === "object") {
    normalizedWorkoutsSource = [source.workouts];
    normalizationMode = "single-workout-in-workouts";
  } else if (source.workout && typeof source.workout === "object") {
    normalizedWorkoutsSource = [source.workout];
    normalizationMode = "single-workout-root";
  } else if (source.data && typeof source.data === "object") {
    const nested = source.data as Record<string, unknown>;
    if (Array.isArray(nested.workouts)) {
      normalizedWorkoutsSource = nested.workouts;
      normalizationMode = "nested-data";
    } else if (nested.workouts && typeof nested.workouts === "object") {
      normalizedWorkoutsSource = [nested.workouts];
      normalizationMode = "nested-data";
    } else if (nested.workout && typeof nested.workout === "object") {
      normalizedWorkoutsSource = [nested.workout];
      normalizationMode = "nested-data";
    }
  } else if (Array.isArray(raw)) {
    normalizedWorkoutsSource = raw;
    normalizationMode = "root-array";
  }

  if (source.schemaVersion !== "1.0") {
    changes.push('schemaVersion missing/invalid -> set to "1.0"');
  }

  const locale = isValidLocale(source.locale) ? source.locale : undefined;
  if (source.locale !== undefined && source.locale !== locale) {
    changes.push("Unsupported locale removed");
  }

  if (!normalizedWorkoutsSource) {
    errors.push("workouts must be an array");
    return {
      repairedObject: null,
      drafts: [],
      changes,
      errors
    };
  }

  const repairedWorkouts: TrainingPlanImportV1["workouts"] = [];

  if (normalizationMode === "single-workout-in-workouts") {
    changes.push("workouts normalized to array");
  }
  if (normalizationMode === "single-workout-root") {
    changes.push("workout wrapped into workouts array");
  }
  if (normalizationMode === "nested-data") {
    changes.push("nested workout payload extracted");
  }
  if (normalizationMode === "root-array") {
    changes.push("root array wrapped into workouts object");
  }

  normalizedWorkoutsSource.forEach((rawWorkout, workoutIndex) => {
    if (!rawWorkout || typeof rawWorkout !== "object") {
      changes.push(`workout[${workoutIndex}] removed (not an object)`);
      return;
    }

    const workoutSource = rawWorkout as Record<string, unknown>;
    const workoutName = typeof workoutSource.name === "string" ? workoutSource.name.trim() : "";
    const rawWorkoutIcon = workoutSource.icon;
    const workoutIcon = normalizeWorkoutIconKey(rawWorkoutIcon);

    if (!workoutName) {
      changes.push(`workout[${workoutIndex}] removed (missing name)`);
      return;
    }
    if (rawWorkoutIcon !== undefined) {
      if (typeof rawWorkoutIcon === "string" && !workoutIcon) {
        changes.push(`workout[${workoutIndex}].icon removed (unsupported icon)`);
      } else if (typeof rawWorkoutIcon !== "string") {
        changes.push(`workout[${workoutIndex}].icon removed (must be string)`);
      } else if (rawWorkoutIcon.trim() !== workoutIcon) {
        changes.push(`workout[${workoutIndex}].icon normalized to "${workoutIcon}"`);
      }
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
      const x2Raw = exerciseSource.x2Enabled ?? exerciseSource.x2;
      const x2Enabled =
        typeof x2Raw === "boolean"
          ? x2Raw
          : typeof x2Raw === "string"
            ? ["true", "1", "yes", "ja"].includes(x2Raw.trim().toLowerCase())
            : undefined;
      const negativeWeightRaw =
        exerciseSource.negativeWeightEnabled ??
        exerciseSource.negativeWeight ??
        exerciseSource.assistedWeight ??
        exerciseSource.assisted;
      const negativeWeightEnabledFromInput =
        typeof negativeWeightRaw === "boolean"
          ? negativeWeightRaw
          : typeof negativeWeightRaw === "string"
            ? ["true", "1", "yes", "ja"].includes(negativeWeightRaw.trim().toLowerCase())
            : undefined;
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

        if (repsValue === undefined || repsValue <= 0) {
          changes.push(`set removed at workout[${workoutIndex}].exercise[${exerciseIndex}].set[${setIndex}] (invalid reps)`);
          return;
        }

        repairedSets.push({
          targetReps: Math.round(Math.abs(repsValue)),
          targetWeight: Number(weightValue)
        });
      });

      if (repairedSets.length === 0) {
        changes.push(`workout[${workoutIndex}].exercise[${exerciseIndex}] removed (all sets invalid)`);
        return;
      }

      const hasNegativeWeights = repairedSets.some((set) => set.targetWeight < 0);
      const negativeWeightEnabled = negativeWeightEnabledFromInput || hasNegativeWeights;
      const normalizedSets = repairedSets.map((set) => {
        if (!negativeWeightEnabled || set.targetWeight === 0) {
          return set;
        }
        return {
          ...set,
          targetWeight: -Math.abs(set.targetWeight)
        };
      });

      repairedExercises.push({
        name: exerciseName,
        notes,
        ...(x2Enabled ? { x2Enabled: true } : {}),
        ...(negativeWeightEnabled ? { negativeWeightEnabled: true } : {}),
        sets: normalizedSets
      });
    });

    if (repairedExercises.length === 0) {
      changes.push(`workout[${workoutIndex}] removed (no valid exercises)`);
      return;
    }

    repairedWorkouts.push({
      name: workoutName,
      ...(workoutIcon ? { icon: workoutIcon } : {}),
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

  const candidate: TrainingPlanImportV1 = {
    schemaVersion: "1.0",
    ...(locale ? { locale } : {}),
    workouts: repairedWorkouts
  };

  const validationErrors = validateCandidate(candidate);
  if (validationErrors.length > 0) {
    return {
      repairedObject: null,
      drafts: [],
      changes,
      errors: validationErrors
    };
  }

  return {
    repairedObject: candidate,
    drafts: candidate.workouts,
    changes,
    errors
  };
}

export function buildAiImportPrompt(language: AppLanguage, planText: string) {
  const trimmedPlanText = planText.trim();

  if (language === "de") {
    return `Du bist ein präziser Trainingsplan-Konverter für Gymtracker. Analysiere den Trainingsplan aus dem beigefügten Text und optional aus einer beigefügten Datei (z. B. PDF oder Foto) und gib ausschließlich valides JSON zurück. Kein Markdown, keine Code-Blöcke, keine Erklärungen.

Regeln:
1) Gib genau EIN JSON-Objekt auf Top-Level zurück.
2) Das Top-Level muss exakt diese Struktur haben: { "schemaVersion": "1.0", "locale": "de", "workouts": [ ... ] }
3) Verwende NIE "workout" im Singular auf Top-Level. Verwende IMMER "workouts" als Array, auch wenn es nur ein Workout gibt.
4) schemaVersion muss exakt "1.0" sein.
5) targetReps und targetWeight müssen Zahlen sein (kein String, kein null).
6) targetWeight darf 0 sein, wenn kein Gewicht angegeben ist oder es eine reine Körpergewichtsübung ist.
7) Optional: "x2Enabled": true nur setzen, wenn die Übung in der App als 2x zählen soll. Das ist vor allem sinnvoll bei einseitigen Übungen oder Übungen, die pro Seite separat ausgeführt werden.
8) Optional: "negativeWeightEnabled": true nur setzen, wenn die Übung als Negativgewicht bzw. assistiert angelegt werden soll.
9) Wenn "negativeWeightEnabled": true gesetzt wird, dann müssen die targetWeight-Werte dieser Übung negative Zahlen sein, z. B. -20 für 20 kg Gegengewicht bei assistierten Klimmzügen.
10) Setze nach Möglichkeit für jedes Workout ein passendes "icon" auf Workout-Ebene. Erlaubte Werte: ${importIconKeyList}
11) Das Feld "notes" nur einfügen, wenn wirklich eine Anmerkung vorhanden ist - sonst weglassen.
12) Nur die Felder aus dem Schema verwenden - keine Extrafelder.
13) Jede Übung braucht mindestens einen Satz.
14) Wenn mehrere Trainingstage oder Splits erkennbar sind, lege mehrere Workouts an.
15) Vergib sinnvolle Workout-Namen. Verwende NICHT generische Namen wie "Workout", "Workout-Daten", "Trainingsplan" oder "Plan". Der Name soll den Split oder Fokus klar erkennen lassen.
16) Wähle außerdem möglichst immer eines der erlaubten Workout-Icons passend zum Namen oder Fokus des Workouts, z. B. "shirt" für Oberkörper, "chevrons-down" oder "footprints" für Unterkörper/Beine, "mountain" oder "person-standing" für Ganzkörper, "arrow-up" für Push, "arrow-down" für Pull, "dumbbell" für allgemeines Krafttraining.
17) Typische gute Beispiele für Workout-Namen sind: "Oberkörper", "Unterkörper", "Ganzkörper", "Push", "Pull", "Beine", "Oberkörper A", "Unterkörper B", "Push Day", "Pull Day", "Brust/Schulter/Trizeps", "Rücken/Bizeps".
18) Ergänze fehlende Details nur konservativ. Nichts frei erfinden, was nicht sinnvoll aus Text oder Datei ableitbar ist.
19) Alle erzeugten Textfelder sollen auf Deutsch formuliert sein.

Schema:
{
  "schemaVersion": "1.0",
  "locale": "de",
  "workouts": [
    {
      "name": "Oberkörper A",
      "icon": "dumbbell",
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
        },
        {
          "name": "Kurzhantel-Ausfallschritte",
          "x2Enabled": true,
          "sets": [
            { "targetReps": 10, "targetWeight": 14 }
          ]
        },
        {
          "name": "Assistierte Klimmzüge",
          "negativeWeightEnabled": true,
          "sets": [
            { "targetReps": 8, "targetWeight": -20 }
          ]
        }
      ]
    }
  ]
}

Zusätzlicher Nutzertext:
${trimmedPlanText || "(Kein zusätzlicher Text mitgegeben. Nutze die beigefügte Datei, falls vorhanden.)"}`;
  }

  return `You are a precise workout-plan converter for Gymtracker. Analyze the training plan from the provided text and any optional attached file (for example PDF or photo) and return valid JSON only. No markdown, no code blocks, no explanations.

Rules:
1) Return exactly ONE JSON object at the top level.
2) The top level must exactly follow this structure: { "schemaVersion": "1.0", "locale": "en", "workouts": [ ... ] }
3) NEVER return top-level "workout" in singular form. ALWAYS use "workouts" as an array, even if there is only one workout.
4) schemaVersion must be exactly "1.0".
5) targetReps and targetWeight must be numbers (not strings, not null).
6) targetWeight may be 0 if no weight is specified or if the exercise is pure bodyweight.
7) Optional: include "x2Enabled": true only if the exercise should count as 2x in the app, mainly for unilateral exercises or movements performed separately per side.
8) Optional: include "negativeWeightEnabled": true only if the exercise should be stored as assisted / negative weight.
9) If "negativeWeightEnabled": true is set, the targetWeight values of that exercise must be negative numbers, for example -20 for 20 kg assistance on assisted pull-ups.
10) Whenever possible, set a fitting workout-level "icon" for each workout. Allowed values: ${importIconKeyList}
11) Only include the "notes" field if there is an actual note. Omit it otherwise.
12) Use only the schema fields. No extra fields.
13) Every exercise needs at least one set.
14) If the source clearly contains multiple workout days or splits, create multiple workouts.
15) Choose meaningful workout names. Do NOT use generic names like "Workout", "Workout Data", "Training Plan", or "Plan". The name should clearly reflect the split or focus.
16) Also choose one of the allowed workout icons whenever possible based on the workout name or focus, for example "shirt" for upper body, "chevrons-down" or "footprints" for lower body/legs, "mountain" or "person-standing" for full body, "arrow-up" for push, "arrow-down" for pull, "dumbbell" for general strength training.
17) Typical good examples for workout names are: "Upper Body", "Lower Body", "Full Body", "Push", "Pull", "Legs", "Upper Body A", "Lower Body B", "Push Day", "Pull Day", "Chest/Shoulders/Triceps", "Back/Biceps".
18) Fill gaps conservatively. Do not invent details that are not reasonably implied by the source.
19) Keep all generated text fields in English.

Schema:
{
  "schemaVersion": "1.0",
  "locale": "en",
  "workouts": [
    {
      "name": "Upper Body A",
      "icon": "dumbbell",
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
        },
        {
          "name": "Dumbbell Lunges",
          "x2Enabled": true,
          "sets": [
            { "targetReps": 10, "targetWeight": 14 }
          ]
        },
        {
          "name": "Assisted Pull-ups",
          "negativeWeightEnabled": true,
          "sets": [
            { "targetReps": 8, "targetWeight": -20 }
          ]
        }
      ]
    }
  ]
}

Additional user text:
${trimmedPlanText || "(No extra text provided. Use the attached file if one is included.)"}`;
}
