import { Globe, SunMoon, Timer, Weight, DoorClosedLocked } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppLanguage, ColorScheme, WeightUnit } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import {
  OptionTabsCard,
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

      <div className="grid gap-4 md:grid-cols-2">
        <OptionTabsCard
          icon={Globe}
          title={t("language")}
          value={language}
          onValueChange={(value) => setLanguage(value as AppLanguage)}
          options={languageOptions}
        />
        <OptionTabsCard
          icon={Weight}
          title={t("unit")}
          value={weightUnit}
          onValueChange={(value) => setWeightUnit(value as WeightUnit)}
          options={weightOptions}
        />
      </div>

      <OptionTabsCard
        icon={SunMoon}
        title={t("colorScheme")}
        value={colorScheme}
        onValueChange={(value) => setColorScheme(value as ColorScheme)}
        options={colorSchemeOptions}
      />
    </TabsContent>
  );
}
