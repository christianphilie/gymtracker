import type { WorkoutIconKey } from "@/db/types";
export type { WorkoutIconKey } from "@/db/types";

export const WORKOUT_ICON_KEYS = [
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
] as const;

export interface WorkoutIconOption {
  value: WorkoutIconKey;
  label: {
    de: string;
    en: string;
  };
}

export const WORKOUT_ICON_OPTIONS: WorkoutIconOption[] = [
  { value: "dumbbell", label: { de: "Hantel", en: "Dumbbell" } },
  { value: "target", label: { de: "Ziel", en: "Target" } },
  { value: "flame", label: { de: "Intensiv", en: "Flame" } },
  { value: "zap", label: { de: "Power", en: "Power" } },
  { value: "heart-pulse", label: { de: "Puls", en: "Heart" } },
  { value: "shield", label: { de: "Stabil", en: "Shield" } },
  { value: "footprints", label: { de: "Beine", en: "Legs" } },
  { value: "mountain", label: { de: "Ganzkörper", en: "Full Body" } },
  { value: "activity", label: { de: "Fitness", en: "Activity" } },
  { value: "repeat", label: { de: "Zirkel", en: "Circuit" } },
  { value: "arrow-up", label: { de: "Push", en: "Push" } },
  { value: "arrow-down", label: { de: "Pull", en: "Pull" } },
  { value: "arrow-right", label: { de: "Push (rechts)", en: "Push (Right)" } },
  { value: "arrow-left", label: { de: "Pull (links)", en: "Pull (Left)" } },
  { value: "arrow-left-right", label: { de: "Push/Pull", en: "Push/Pull" } },
  { value: "chevrons-up", label: { de: "Upper Split", en: "Upper Split" } },
  { value: "chevrons-down", label: { de: "Unterkörper", en: "Lower Body" } },
  { value: "shirt", label: { de: "Oberkörper", en: "Upper Body" } },
  { value: "person-standing", label: { de: "Ganzkörper (Person)", en: "Full Body (Person)" } },
  { value: "swords", label: { de: "Split", en: "Split" } }
];

export function isWorkoutIconKey(value: unknown): value is WorkoutIconKey {
  return typeof value === "string" && (WORKOUT_ICON_KEYS as readonly string[]).includes(value);
}

export function normalizeWorkoutIconKey(value: unknown): WorkoutIconKey | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return isWorkoutIconKey(normalized) ? normalized : undefined;
}
