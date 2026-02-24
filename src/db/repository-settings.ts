import { db } from "@/db/db";
import type { ColorScheme, Settings, WeightUnit } from "@/db/types";

const SETTINGS_ID = 1;

function nowIso() {
  return new Date().toISOString();
}

function convertWeightValue(value: number, from: WeightUnit, to: WeightUnit) {
  if (from === to) {
    return value;
  }

  const converted = from === "kg" ? value * 2.2046226218 : value / 2.2046226218;
  return Math.round(converted * 10) / 10;
}

function normalizeOptionalPositive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeOptionalPositiveInt(value: unknown) {
  const normalized = normalizeOptionalPositive(value);
  if (normalized === undefined) {
    return undefined;
  }
  return Math.max(1, Math.round(normalized));
}

export async function ensureDefaultSettings() {
  const existing = await db.settings.get(SETTINGS_ID);
  if (existing) {
    const patch: Partial<Settings> = {};
    const hadLegacyNoTimer = existing.restTimerSeconds === 0;
    if (existing.restTimerSeconds === undefined) {
      patch.restTimerSeconds = 120;
    } else if (![60, 120, 180, 300].includes(existing.restTimerSeconds)) {
      patch.restTimerSeconds = 120;
    }
    if (existing.restTimerEnabled === undefined) {
      patch.restTimerEnabled = hadLegacyNoTimer ? false : true;
    }
    if (existing.colorScheme === undefined) {
      patch.colorScheme = "system";
    }
    if (existing.lockerNoteEnabled === undefined) {
      patch.lockerNoteEnabled = true;
    }
    if (existing.lockerNumber === undefined) {
      patch.lockerNumber = "";
    }
    if (existing.lockerNumberUpdatedAt === undefined) {
      patch.lockerNumberUpdatedAt = "";
    }
    if (existing.bodyWeight !== undefined && !Number.isFinite(existing.bodyWeight)) {
      patch.bodyWeight = undefined;
    }
    if (existing.weeklyWeightGoal !== normalizeOptionalPositive(existing.weeklyWeightGoal)) {
      patch.weeklyWeightGoal = normalizeOptionalPositive(existing.weeklyWeightGoal);
    }
    if (existing.weeklyCaloriesGoal !== normalizeOptionalPositive(existing.weeklyCaloriesGoal)) {
      patch.weeklyCaloriesGoal = normalizeOptionalPositive(existing.weeklyCaloriesGoal);
    }
    if (existing.weeklyWorkoutCountGoal !== normalizeOptionalPositiveInt(existing.weeklyWorkoutCountGoal)) {
      patch.weeklyWorkoutCountGoal = normalizeOptionalPositiveInt(existing.weeklyWorkoutCountGoal);
    }
    if (existing.weeklyDurationGoal !== normalizeOptionalPositiveInt(existing.weeklyDurationGoal)) {
      patch.weeklyDurationGoal = normalizeOptionalPositiveInt(existing.weeklyDurationGoal);
    }
    if (Object.keys(patch).length > 0) {
      const patched: Settings = { ...existing, ...patch, updatedAt: nowIso() };
      await db.settings.put(patched);
      return patched;
    }
    return existing;
  }

  const now = nowIso();
  const defaults: Settings = {
    id: SETTINGS_ID,
    language: "de",
    weightUnit: "kg",
    restTimerSeconds: 120,
    restTimerEnabled: true,
    bodyWeight: undefined,
    lockerNoteEnabled: true,
    lockerNumber: "",
    lockerNumberUpdatedAt: "",
    colorScheme: "system",
    createdAt: now,
    updatedAt: now
  };

  await db.settings.put(defaults);
  return defaults;
}

export async function updateSettings(
  patch: Partial<
    Pick<
      Settings,
      | "language"
      | "weightUnit"
      | "restTimerSeconds"
      | "restTimerEnabled"
      | "colorScheme"
      | "lockerNoteEnabled"
      | "lockerNumber"
      | "lockerNumberUpdatedAt"
      | "bodyWeight"
      | "weeklyWeightGoal"
      | "weeklyCaloriesGoal"
      | "weeklyWorkoutCountGoal"
      | "weeklyDurationGoal"
    >
  >
) {
  const current = await ensureDefaultSettings();
  const next: Settings = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };
  await db.settings.put(next);
  return next;
}

export async function updateRestTimerSeconds(seconds: number) {
  const clamped = seconds <= 60 ? 60 : seconds <= 120 ? 120 : seconds <= 180 ? 180 : 300;
  return updateSettings({ restTimerSeconds: clamped });
}

export async function updateRestTimerEnabled(enabled: boolean) {
  return updateSettings({ restTimerEnabled: enabled });
}

export async function updateLockerNoteEnabled(enabled: boolean) {
  return updateSettings({ lockerNoteEnabled: enabled });
}

export async function updateLockerNumber(lockerNumber: string) {
  return updateSettings({
    lockerNumber: lockerNumber.trim(),
    lockerNumberUpdatedAt: nowIso()
  });
}

export async function updateColorScheme(scheme: ColorScheme) {
  return updateSettings({ colorScheme: scheme });
}

export async function updateWeightUnitAndConvert(nextUnit: WeightUnit) {
  await ensureDefaultSettings();

  await db.transaction(
    "rw",
    [db.settings, db.exerciseTemplateSets, db.sessionExerciseSets],
    async () => {
      const currentSettings = (await db.settings.get(SETTINGS_ID)) ?? (await ensureDefaultSettings());
      if (currentSettings.weightUnit === nextUnit) {
        return;
      }

      const templateSets = await db.exerciseTemplateSets.toArray();
      for (const set of templateSets) {
        if (set.id === undefined) {
          continue;
        }

        await db.exerciseTemplateSets.update(set.id, {
          targetWeight: convertWeightValue(set.targetWeight, currentSettings.weightUnit, nextUnit)
        });
      }

      const sessionSets = await db.sessionExerciseSets.toArray();
      for (const set of sessionSets) {
        if (set.id === undefined) {
          continue;
        }

        await db.sessionExerciseSets.update(set.id, {
          targetWeight: convertWeightValue(set.targetWeight, currentSettings.weightUnit, nextUnit),
          actualWeight:
            set.actualWeight === undefined
              ? undefined
              : convertWeightValue(set.actualWeight, currentSettings.weightUnit, nextUnit)
        });
      }

      await db.settings.put({
        ...currentSettings,
        weightUnit: nextUnit,
        bodyWeight:
          currentSettings.bodyWeight === undefined
            ? undefined
            : convertWeightValue(currentSettings.bodyWeight, currentSettings.weightUnit, nextUnit),
        weeklyWeightGoal:
          currentSettings.weeklyWeightGoal === undefined
            ? undefined
            : convertWeightValue(currentSettings.weeklyWeightGoal, currentSettings.weightUnit, nextUnit),
        updatedAt: nowIso()
      });
    }
  );

  return db.settings.get(SETTINGS_ID);
}

export async function getSettings() {
  return ensureDefaultSettings();
}
