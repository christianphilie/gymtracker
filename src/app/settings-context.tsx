import { createContext, useContext, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { ensureDefaultSettings, updateSettings } from "@/db/repository";
import type { AppLanguage, WeightUnit } from "@/db/types";
import { messages, type TranslationKey } from "@/i18n/translations";

interface SettingsContextValue {
  language: AppLanguage;
  weightUnit: WeightUnit;
  t: (key: TranslationKey) => string;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void ensureDefaultSettings();
  }, []);

  const settings = useLiveQuery(async () => db.settings.get(1), []);

  const value = useMemo<SettingsContextValue>(() => {
    const language = settings?.language ?? "de";
    const weightUnit = settings?.weightUnit ?? "kg";

    return {
      language,
      weightUnit,
      t: (key) => messages[language][key] ?? key,
      setLanguage: async (nextLanguage) => {
        await updateSettings({ language: nextLanguage });
      },
      setWeightUnit: async (nextUnit) => {
        await updateSettings({ weightUnit: nextUnit });
      }
    };
  }, [settings?.language, settings?.weightUnit]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
