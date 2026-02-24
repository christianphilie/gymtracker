export type CanonicalMuscleGroupKey = "back" | "shoulders" | "legs" | "core" | "chest" | "arms";

export type MiddleMuscleGroupKey =
  | "abductors"
  | "abs"
  | "adductors"
  | "biceps"
  | "calves"
  | "chest"
  | "forearms"
  | "glutes"
  | "hamstrings"
  | "hip_flexors"
  | "lats"
  | "lower_back"
  | "obliques"
  | "quads"
  | "shoulders"
  | "tibialis_anterior"
  | "traps"
  | "triceps";

export interface MiddleMuscleGroupDefinition {
  key: MiddleMuscleGroupKey;
  topGroup: CanonicalMuscleGroupKey;
  labels: {
    de: string;
    en: string;
  };
}

const MIDDLE_MUSCLE_GROUPS: readonly MiddleMuscleGroupDefinition[] = [
  { key: "abductors", topGroup: "legs", labels: { de: "Abduktoren", en: "Abductors" } },
  { key: "abs", topGroup: "core", labels: { de: "Bauch", en: "Abs" } },
  { key: "adductors", topGroup: "legs", labels: { de: "Adduktoren", en: "Adductors" } },
  { key: "biceps", topGroup: "arms", labels: { de: "Bizeps", en: "Biceps" } },
  { key: "calves", topGroup: "legs", labels: { de: "Waden", en: "Calves" } },
  { key: "chest", topGroup: "chest", labels: { de: "Brust", en: "Chest" } },
  { key: "forearms", topGroup: "arms", labels: { de: "Unterarme", en: "Forearms" } },
  { key: "glutes", topGroup: "legs", labels: { de: "Gesäß", en: "Glutes" } },
  { key: "hamstrings", topGroup: "legs", labels: { de: "Hamstrings", en: "Hamstrings" } },
  { key: "hip_flexors", topGroup: "legs", labels: { de: "Hüftbeuger", en: "Hip Flexors" } },
  { key: "lats", topGroup: "back", labels: { de: "Lat", en: "Lats" } },
  { key: "lower_back", topGroup: "back", labels: { de: "Unterer Rücken", en: "Lower Back" } },
  { key: "obliques", topGroup: "core", labels: { de: "Seitliche Bauchmuskeln", en: "Obliques" } },
  { key: "quads", topGroup: "legs", labels: { de: "Quadrizeps", en: "Quads" } },
  { key: "shoulders", topGroup: "shoulders", labels: { de: "Schultern", en: "Shoulders" } },
  { key: "tibialis_anterior", topGroup: "legs", labels: { de: "Schienbeinmuskel", en: "Tibialis Anterior" } },
  { key: "traps", topGroup: "back", labels: { de: "Trapez", en: "Traps" } },
  { key: "triceps", topGroup: "arms", labels: { de: "Trizeps", en: "Triceps" } }
] as const;

export type CanonicalMuscleKey =
  | "abductors"
  | "adductors"
  | "rectus_abdominis"
  | "transversus_abdominis"
  | "biceps_brachii"
  | "brachialis"
  | "gastrocnemius"
  | "soleus"
  | "upper_chest"
  | "mid_chest"
  | "lower_chest"
  | "serratus_anterior"
  | "forearm_flexors"
  | "forearm_extensors"
  | "brachioradialis"
  | "gluteus_maximus"
  | "gluteus_medius"
  | "gluteus_minimus"
  | "biceps_femoris"
  | "semitendinosus"
  | "semimembranosus"
  | "iliopsoas"
  | "latissimus_dorsi"
  | "teres_major"
  | "erector_spinae"
  | "external_obliques"
  | "internal_obliques"
  | "rectus_femoris"
  | "vastus_lateralis"
  | "vastus_medialis"
  | "vastus_intermedius"
  | "anterior_delts"
  | "medial_delts"
  | "rear_delts"
  | "rotator_cuff"
  | "tibialis_anterior"
  | "upper_traps"
  | "mid_traps"
  | "lower_traps"
  | "triceps_long_head"
  | "triceps_lateral_head"
  | "triceps_medial_head";

export interface CanonicalMuscleDefinition {
  key: CanonicalMuscleKey;
  topGroup: CanonicalMuscleGroupKey;
  middleGroup: MiddleMuscleGroupKey;
  detailLabels: {
    de: string;
    en: string;
  };
  aliases?: string[];
}

const CANONICAL_MUSCLE_DEFINITIONS_LIST: readonly CanonicalMuscleDefinition[] = [
  { key: "abductors", topGroup: "legs", middleGroup: "abductors", detailLabels: { de: "Abduktoren", en: "Abductors" }, aliases: ["hip abductors"] },
  { key: "adductors", topGroup: "legs", middleGroup: "adductors", detailLabels: { de: "Adduktoren", en: "Adductors" }, aliases: ["hip adductors"] },
  { key: "rectus_abdominis", topGroup: "core", middleGroup: "abs", detailLabels: { de: "Gerader Bauchmuskel", en: "Rectus Abdominis" }, aliases: ["abs", "abdominals"] },
  { key: "transversus_abdominis", topGroup: "core", middleGroup: "abs", detailLabels: { de: "Tiefer Bauch (Transversus)", en: "Transversus Abdominis" }, aliases: ["deep core", "tva", "transverse abdominis"] },
  { key: "biceps_brachii", topGroup: "arms", middleGroup: "biceps", detailLabels: { de: "Bizeps brachii", en: "Biceps Brachii" }, aliases: ["biceps"] },
  { key: "brachialis", topGroup: "arms", middleGroup: "biceps", detailLabels: { de: "Brachialis", en: "Brachialis" } },
  { key: "gastrocnemius", topGroup: "legs", middleGroup: "calves", detailLabels: { de: "Wade (oberflächlich)", en: "Gastrocnemius" }, aliases: ["calf", "calves"] },
  { key: "soleus", topGroup: "legs", middleGroup: "calves", detailLabels: { de: "Wade (tiefer Muskel)", en: "Soleus" } },
  { key: "upper_chest", topGroup: "chest", middleGroup: "chest", detailLabels: { de: "Obere Brust", en: "Upper Chest" }, aliases: ["clavicular pec"] },
  { key: "mid_chest", topGroup: "chest", middleGroup: "chest", detailLabels: { de: "Mittlere Brust", en: "Mid Chest" }, aliases: ["sternocostal pec", "mid pec"] },
  { key: "lower_chest", topGroup: "chest", middleGroup: "chest", detailLabels: { de: "Untere Brust", en: "Lower Chest" }, aliases: ["lower pec"] },
  { key: "serratus_anterior", topGroup: "chest", middleGroup: "chest", detailLabels: { de: "Serratus anterior", en: "Serratus Anterior" }, aliases: ["serratus"] },
  { key: "forearm_flexors", topGroup: "arms", middleGroup: "forearms", detailLabels: { de: "Unterarmbeuger", en: "Forearm Flexors" } },
  { key: "forearm_extensors", topGroup: "arms", middleGroup: "forearms", detailLabels: { de: "Unterarmstrecker", en: "Forearm Extensors" } },
  { key: "brachioradialis", topGroup: "arms", middleGroup: "forearms", detailLabels: { de: "Brachioradialis", en: "Brachioradialis" } },
  { key: "gluteus_maximus", topGroup: "legs", middleGroup: "glutes", detailLabels: { de: "Gesäß (Hauptmuskel)", en: "Gluteus Maximus" }, aliases: ["glutes", "gluteus", "glute"] },
  { key: "gluteus_medius", topGroup: "legs", middleGroup: "glutes", detailLabels: { de: "Gesäß (seitlich)", en: "Gluteus Medius" } },
  { key: "gluteus_minimus", topGroup: "legs", middleGroup: "glutes", detailLabels: { de: "Gesäß (tiefer seitlich)", en: "Gluteus Minimus" } },
  { key: "biceps_femoris", topGroup: "legs", middleGroup: "hamstrings", detailLabels: { de: "Biceps femoris", en: "Biceps Femoris" }, aliases: ["hamstrings"] },
  { key: "semitendinosus", topGroup: "legs", middleGroup: "hamstrings", detailLabels: { de: "Semitendinosus", en: "Semitendinosus" } },
  { key: "semimembranosus", topGroup: "legs", middleGroup: "hamstrings", detailLabels: { de: "Semimembranosus", en: "Semimembranosus" } },
  { key: "iliopsoas", topGroup: "legs", middleGroup: "hip_flexors", detailLabels: { de: "Iliopsoas", en: "Iliopsoas" }, aliases: ["hip flexors"] },
  { key: "latissimus_dorsi", topGroup: "back", middleGroup: "lats", detailLabels: { de: "Latissimus", en: "Latissimus Dorsi" }, aliases: ["lats", "lat"] },
  { key: "teres_major", topGroup: "back", middleGroup: "lats", detailLabels: { de: "Teres major", en: "Teres Major" } },
  { key: "erector_spinae", topGroup: "back", middleGroup: "lower_back", detailLabels: { de: "Rückenstrecker", en: "Erector Spinae" }, aliases: ["lower back"] },
  { key: "external_obliques", topGroup: "core", middleGroup: "obliques", detailLabels: { de: "Äußere schräge Bauchmuskeln", en: "External Obliques" }, aliases: ["obliques"] },
  { key: "internal_obliques", topGroup: "core", middleGroup: "obliques", detailLabels: { de: "Innere schräge Bauchmuskeln", en: "Internal Obliques" } },
  { key: "rectus_femoris", topGroup: "legs", middleGroup: "quads", detailLabels: { de: "Rectus femoris", en: "Rectus Femoris" }, aliases: ["quads"] },
  { key: "vastus_lateralis", topGroup: "legs", middleGroup: "quads", detailLabels: { de: "Vastus lateralis", en: "Vastus Lateralis" } },
  { key: "vastus_medialis", topGroup: "legs", middleGroup: "quads", detailLabels: { de: "Vastus medialis", en: "Vastus Medialis" } },
  { key: "vastus_intermedius", topGroup: "legs", middleGroup: "quads", detailLabels: { de: "Vastus intermedius", en: "Vastus Intermedius" } },
  { key: "anterior_delts", topGroup: "shoulders", middleGroup: "shoulders", detailLabels: { de: "Vordere Deltas", en: "Anterior Delts" }, aliases: ["front delts"] },
  { key: "medial_delts", topGroup: "shoulders", middleGroup: "shoulders", detailLabels: { de: "Seitliche Deltas", en: "Medial Delts" }, aliases: ["lateral delts", "side delts"] },
  { key: "rear_delts", topGroup: "shoulders", middleGroup: "shoulders", detailLabels: { de: "Hintere Deltas", en: "Rear Delts" }, aliases: ["posterior delts"] },
  { key: "rotator_cuff", topGroup: "shoulders", middleGroup: "shoulders", detailLabels: { de: "Rotatorenmanschette", en: "Rotator Cuff" } },
  { key: "tibialis_anterior", topGroup: "legs", middleGroup: "tibialis_anterior", detailLabels: { de: "Schienbeinmuskel", en: "Tibialis Anterior" }, aliases: ["shin muscle"] },
  { key: "upper_traps", topGroup: "back", middleGroup: "traps", detailLabels: { de: "Oberer Trapez", en: "Upper Traps" }, aliases: ["traps"] },
  { key: "mid_traps", topGroup: "back", middleGroup: "traps", detailLabels: { de: "Mittlerer Trapez", en: "Mid Traps" } },
  { key: "lower_traps", topGroup: "back", middleGroup: "traps", detailLabels: { de: "Unterer Trapez", en: "Lower Traps" } },
  { key: "triceps_long_head", topGroup: "arms", middleGroup: "triceps", detailLabels: { de: "Trizeps (langer Kopf)", en: "Triceps Long Head" }, aliases: ["triceps"] },
  { key: "triceps_lateral_head", topGroup: "arms", middleGroup: "triceps", detailLabels: { de: "Trizeps (lateraler Kopf)", en: "Triceps Lateral Head" } },
  { key: "triceps_medial_head", topGroup: "arms", middleGroup: "triceps", detailLabels: { de: "Trizeps (medialer Kopf)", en: "Triceps Medial Head" } }
] as const;

const middleGroupByKey = new Map<MiddleMuscleGroupKey, MiddleMuscleGroupDefinition>(
  MIDDLE_MUSCLE_GROUPS.map((item) => [item.key, item])
);

const canonicalMuscleByKey = new Map<CanonicalMuscleKey, CanonicalMuscleDefinition>(
  CANONICAL_MUSCLE_DEFINITIONS_LIST.map((item) => [item.key, item])
);

export const CANONICAL_MUSCLE_DEFINITIONS = [...CANONICAL_MUSCLE_DEFINITIONS_LIST];
export const CANONICAL_MUSCLE_KEYS = CANONICAL_MUSCLE_DEFINITIONS.map((item) => item.key);
export const MIDDLE_MUSCLE_GROUP_DEFINITIONS = [...MIDDLE_MUSCLE_GROUPS];

const canonicalKeySet = new Set<string>(CANONICAL_MUSCLE_KEYS);

export function isCanonicalMuscleKey(value: unknown): value is CanonicalMuscleKey {
  return typeof value === "string" && canonicalKeySet.has(value);
}

export function getCanonicalMuscleGroup(key: CanonicalMuscleKey): CanonicalMuscleGroupKey {
  return canonicalMuscleByKey.get(key)?.topGroup ?? "legs";
}

export function getCanonicalMuscleMiddleGroup(key: CanonicalMuscleKey): MiddleMuscleGroupKey {
  return canonicalMuscleByKey.get(key)?.middleGroup ?? "quads";
}

export function getCanonicalMuscleMiddleLabel(key: CanonicalMuscleKey, locale: "de" | "en") {
  const middleKey = getCanonicalMuscleMiddleGroup(key);
  return middleGroupByKey.get(middleKey)?.labels[locale] ?? middleKey;
}

export function getCanonicalMuscleDetailLabel(key: CanonicalMuscleKey, locale: "de" | "en") {
  return canonicalMuscleByKey.get(key)?.detailLabels[locale] ?? key;
}

export function getCanonicalMuscleLabel(key: CanonicalMuscleKey, locale: "de" | "en") {
  return getCanonicalMuscleMiddleLabel(key, locale);
}

export function getCanonicalMuscleDefinition(key: CanonicalMuscleKey) {
  return canonicalMuscleByKey.get(key);
}
