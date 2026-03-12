import { type ReactNode } from "react";
import { Globe, Monitor, Moon, Settings2, Sun, SunMoon, Timer, Weight, DoorClosedLocked, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppLanguage, ColorScheme, WeightUnit } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import {
  SettingsCardTitle,
  ToggleSettingRow,
  type TabsOption
} from "@/features/settings/settings-page-primitives";

interface SettingsAppTabProps {
  t: (key: TranslationKey) => string;
  language: AppLanguage;
  setLanguage: (value: AppLanguage) => void;
  weightUnit: WeightUnit;
  setWeightUnit: (value: WeightUnit) => void;
  restTimerSeconds: number;
  restTimerEnabled: boolean;
  setRestTimerEnabled: (value: boolean) => void;
  setRestTimerSeconds: (value: number) => void;
  lockerNoteEnabled: boolean;
  setLockerNoteEnabled: (value: boolean) => void;
  colorScheme: ColorScheme;
  setColorScheme: (value: ColorScheme) => void;
  languageOptions: Array<{ value: AppLanguage; label: string }>;
  weightOptions: Array<{ value: WeightUnit; label: string }>;
  colorSchemeOptions: Array<{ value: ColorScheme; label: string }>;
  restTimerLengthOptions: TabsOption[];
}

function CompactPreferenceTabs({
  value,
  onValueChange,
  options
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList className="h-8 rounded-full bg-secondary/80 p-0.5">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="h-6 min-w-7 rounded-full px-1.5 text-[11px]"
              aria-label={option.label}
              title={option.label}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : option.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function CompactPreferenceRow({
  icon: Icon,
  label,
  control
}: {
  icon: LucideIcon;
  label: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/25 px-3 py-2">
      <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground/85">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsAppTab({
  t,
  language,
  setLanguage,
  weightUnit,
  setWeightUnit,
  restTimerSeconds,
  restTimerEnabled,
  setRestTimerEnabled,
  setRestTimerSeconds,
  lockerNoteEnabled,
  setLockerNoteEnabled,
  colorScheme,
  setColorScheme,
  languageOptions,
  weightOptions,
  colorSchemeOptions,
  restTimerLengthOptions
}: SettingsAppTabProps) {
  return (
    <TabsContent value="app" className="space-y-4">
      <Card>
        <CardHeader>
          <SettingsCardTitle icon={DoorClosedLocked}>{t("lockerNoteSettingTitle")}</SettingsCardTitle>
        </CardHeader>
        <CardContent>
          <ToggleSettingRow
            id="locker-note-enabled"
            label={t("lockerNoteToggle")}
            hint={t("lockerNoteToggleHint")}
            checked={lockerNoteEnabled}
            onCheckedChange={setLockerNoteEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsCardTitle icon={Timer}>{t("restTimerDuration")}</SettingsCardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleSettingRow
            id="rest-timer-enabled"
            label={t("restTimerShowToggle")}
            hint={t("restTimerShowToggleHint")}
            checked={restTimerEnabled}
            onCheckedChange={setRestTimerEnabled}
          />
          <div className={`grid transition-all duration-200 ${restTimerEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="space-y-1 pb-1">
                <Label htmlFor="rest-timer-length">{t("restTimerLengthLabel")}</Label>
                <Tabs value={String(restTimerSeconds)} onValueChange={(value) => setRestTimerSeconds(Number(value))}>
                  <TabsList className="w-full">
                    {restTimerLengthOptions.map((option) => (
                      <TabsTrigger key={option.value} value={option.value} className="flex-1" disabled={option.disabled}>
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">{t("restTimerDescription")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsCardTitle icon={Settings2}>{t("display")}</SettingsCardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CompactPreferenceRow
            icon={Globe}
            label={t("language")}
            control={
              <CompactPreferenceTabs
                value={language}
                onValueChange={(value) => setLanguage(value as AppLanguage)}
                options={languageOptions}
              />
            }
          />
          <CompactPreferenceRow
            icon={Weight}
            label={t("unit")}
            control={
              <CompactPreferenceTabs
                value={weightUnit}
                onValueChange={(value) => setWeightUnit(value as WeightUnit)}
                options={weightOptions}
              />
            }
          />
          <CompactPreferenceRow
            icon={SunMoon}
            label={t("colorScheme")}
            control={
              <CompactPreferenceTabs
                value={colorScheme}
                onValueChange={(value) => setColorScheme(value as ColorScheme)}
                options={colorSchemeOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  icon: option.value === "light" ? Sun : option.value === "dark" ? Moon : Monitor
                }))}
              />
            }
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
