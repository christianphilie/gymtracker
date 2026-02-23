import { createContext, useContext, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import {
  createUpdateSafetySnapshotIfNeeded,
  ensureDefaultSettings,
  updateColorScheme,
  updateRestTimerSeconds,
  updateWeightUnitAndConvert,
  updateSettings
} from "@/db/repository";
import type { AppLanguage, ColorScheme, WeightUnit } from "@/db/types";
import { messages, type TranslationKey } from "@/i18n/translations";
import { toast } from "sonner";

interface SettingsContextValue {
  language: AppLanguage;
  weightUnit: WeightUnit;
  weightUnitLabel: string;
  restTimerSeconds: number;
  colorScheme: ColorScheme;
  t: (key: TranslationKey) => string;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  setRestTimerSeconds: (seconds: number) => Promise<void>;
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

  const value = useMemo<SettingsContextValue>(() => {
    const language = settings?.language ?? "de";
    const weightUnit = settings?.weightUnit ?? "kg";
    const restTimerSeconds = settings?.restTimerSeconds ?? 120;
    const currentColorScheme = settings?.colorScheme ?? "system";

    return {
      language,
      weightUnit,
      weightUnitLabel: weightUnit === "lb" ? "lbs" : "kg",
      restTimerSeconds,
      colorScheme: currentColorScheme,
      t: (key) => messages[language][key] ?? key,
      setLanguage: async (nextLanguage) => {
        await updateSettings({ language: nextLanguage });
      },
      setWeightUnit: async (nextUnit) => {
        await updateWeightUnitAndConvert(nextUnit);
      },
      setRestTimerSeconds: async (seconds) => {
        await updateRestTimerSeconds(seconds);
      },
      setColorScheme: async (scheme) => {
        await updateColorScheme(scheme);
      }
    };
  }, [settings?.language, settings?.weightUnit, settings?.restTimerSeconds, settings?.colorScheme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
