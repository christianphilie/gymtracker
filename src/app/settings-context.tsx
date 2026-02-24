import { createContext, useContext, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import {
  createUpdateSafetySnapshotIfNeeded,
  ensureDefaultSettings,
  updateColorScheme,
  updateLockerNoteEnabled,
  updateRestTimerEnabled,
  updateRestTimerSeconds,
  updateWeightUnitAndConvert,
  updateSettings
} from "@/db/repository";
import type { AppLanguage, ColorScheme, WeightUnit } from "@/db/types";
import { runExerciseAiCatalogBackfillIfNeeded } from "@/lib/exercise-ai-catalog-backfill";
import { messages, type TranslationKey } from "@/i18n/translations";
import { toast } from "sonner";

interface SettingsContextValue {
  language: AppLanguage;
  weightUnit: WeightUnit;
  weightUnitLabel: string;
  restTimerSeconds: number;
  restTimerEnabled: boolean;
  lockerNoteEnabled: boolean;
  colorScheme: ColorScheme;
  t: (key: TranslationKey) => string;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  setRestTimerEnabled: (enabled: boolean) => Promise<void>;
  setRestTimerSeconds: (seconds: number) => Promise<void>;
  setLockerNoteEnabled: (enabled: boolean) => Promise<void>;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const initialize = async () => {
      try {
        await ensureDefaultSettings();
        await createUpdateSafetySnapshotIfNeeded();
      } catch {
        toast.error(messages.de.updateSafetyCreateFailed);
      }
    };

    void initialize();
  }, []);

  const settings = useLiveQuery(async () => db.settings.get(1), []);

  const colorScheme = settings?.colorScheme ?? "system";

  useEffect(() => {
    const applyTheme = () => {
      const shouldBeDark =
        colorScheme === "dark" ||
        (colorScheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

      if (shouldBeDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    applyTheme();

    if (colorScheme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [colorScheme]);

  useEffect(() => {
    if (!settings?.language) {
      return;
    }

    void runExerciseAiCatalogBackfillIfNeeded(settings.language);
  }, [settings?.language]);

  const value = useMemo<SettingsContextValue>(() => {
    const language = settings?.language ?? "de";
    const weightUnit = settings?.weightUnit ?? "kg";
    const restTimerSeconds = settings?.restTimerSeconds ?? 120;
    const restTimerEnabled = settings?.restTimerEnabled ?? true;
    const lockerNoteEnabled = settings?.lockerNoteEnabled ?? true;
    const currentColorScheme = settings?.colorScheme ?? "system";

    return {
      language,
      weightUnit,
      weightUnitLabel: weightUnit === "lb" ? "lbs" : "kg",
      restTimerSeconds,
      restTimerEnabled,
      lockerNoteEnabled,
      colorScheme: currentColorScheme,
      t: (key) => messages[language][key] ?? key,
      setLanguage: async (nextLanguage) => {
        await updateSettings({ language: nextLanguage });
      },
      setWeightUnit: async (nextUnit) => {
        await updateWeightUnitAndConvert(nextUnit);
      },
      setRestTimerEnabled: async (enabled) => {
        await updateRestTimerEnabled(enabled);
      },
      setRestTimerSeconds: async (seconds) => {
        await updateRestTimerSeconds(seconds);
      },
      setLockerNoteEnabled: async (enabled) => {
        await updateLockerNoteEnabled(enabled);
      },
      setColorScheme: async (scheme) => {
        await updateColorScheme(scheme);
      }
    };
  }, [
    settings?.language,
    settings?.weightUnit,
    settings?.restTimerSeconds,
    settings?.restTimerEnabled,
    settings?.lockerNoteEnabled,
    settings?.colorScheme
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
