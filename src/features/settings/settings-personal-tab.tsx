import { Clock3, Dumbbell, Flame, Target, Weight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import type { WeightUnit } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import { SettingsCardTitle } from "@/features/settings/settings-page-primitives";

interface SettingsPersonalTabProps {
  t: (key: TranslationKey) => string;
  weightUnit: WeightUnit;
  bodyWeightDraft: string;
  setBodyWeightDraft: (value: string) => void;
  onBodyWeightCommit: () => void;
  weeklyWorkoutCountGoalDraft: string;
  setWeeklyWorkoutCountGoalDraft: (value: string) => void;
  weeklyWorkoutCountGoalEnabled: boolean;
  onWeeklyWorkoutGoalToggle: (checked: boolean) => void;
  onWeeklyWorkoutCountGoalCommit: () => void;
  weeklyDurationGoalDraft: string;
  setWeeklyDurationGoalDraft: (value: string) => void;
  weeklyDurationGoalEnabled: boolean;
  onWeeklyDurationGoalToggle: (checked: boolean) => void;
  onWeeklyDurationGoalCommit: () => void;
  weeklyWeightGoalDraft: string;
  setWeeklyWeightGoalDraft: (value: string) => void;
  weeklyWeightGoalEnabled: boolean;
  onWeeklyWeightGoalToggle: (checked: boolean) => void;
  onWeeklyWeightGoalCommit: () => void;
  weeklyCaloriesGoalDraft: string;
  setWeeklyCaloriesGoalDraft: (value: string) => void;
  weeklyCaloriesGoalEnabled: boolean;
  onWeeklyCaloriesGoalToggle: (checked: boolean) => void;
  onWeeklyCaloriesGoalCommit: () => void;
}

export function SettingsPersonalTab({
  t,
  weightUnit,
  bodyWeightDraft,
  setBodyWeightDraft,
  onBodyWeightCommit,
  weeklyWorkoutCountGoalDraft,
  setWeeklyWorkoutCountGoalDraft,
  weeklyWorkoutCountGoalEnabled,
  onWeeklyWorkoutGoalToggle,
  onWeeklyWorkoutCountGoalCommit,
  weeklyDurationGoalDraft,
  setWeeklyDurationGoalDraft,
  weeklyDurationGoalEnabled,
  onWeeklyDurationGoalToggle,
  onWeeklyDurationGoalCommit,
  weeklyWeightGoalDraft,
  setWeeklyWeightGoalDraft,
  weeklyWeightGoalEnabled,
  onWeeklyWeightGoalToggle,
  onWeeklyWeightGoalCommit,
  weeklyCaloriesGoalDraft,
  setWeeklyCaloriesGoalDraft,
  weeklyCaloriesGoalEnabled,
  onWeeklyCaloriesGoalToggle,
  onWeeklyCaloriesGoalCommit
}: SettingsPersonalTabProps) {
  return (
    <TabsContent value="personal" className="space-y-4">
      <Card>
        <CardHeader>
          <SettingsCardTitle icon={Weight}>{t("bodyWeight")}</SettingsCardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative w-full">
              <Input
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={bodyWeightDraft}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  if (/^[0-9]*([.,][0-9]*)?$/.test(next) || next === "") {
                    setBodyWeightDraft(next);
                  }
                }}
                onBlur={onBodyWeightCommit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                placeholder={weightUnit === "kg" ? "70" : "155"}
                aria-label={t("bodyWeight")}
                className="pr-12"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {weightUnit}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("bodyWeightHint")}</p>
          <p className="text-xs text-muted-foreground">{t("calorieEstimateInfo")}</p>
        </CardContent>
      </Card>

      <Card id="weekly-goals" className="scroll-mt-20">
        <CardHeader>
          <SettingsCardTitle icon={Target}>{t("weeklyGoals")}</SettingsCardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="weekly-workout-goal-enabled" className="text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    {t("weeklyWorkoutGoal")}
                  </span>
                </Label>
              </div>
              <Switch
                id="weekly-workout-goal-enabled"
                checked={weeklyWorkoutCountGoalEnabled}
                onCheckedChange={onWeeklyWorkoutGoalToggle}
              />
            </div>
            <div className={`grid transition-all duration-200 ${weeklyWorkoutCountGoalEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <div className="relative px-1 py-1.5">
                  <Input
                    id="weekly-workout-goal"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={weeklyWorkoutCountGoalDraft}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (/^[0-9]*$/.test(next)) {
                        setWeeklyWorkoutCountGoalDraft(next);
                      }
                    }}
                    onBlur={onWeeklyWorkoutCountGoalCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="pr-20"
                    disabled={!weeklyWorkoutCountGoalEnabled}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {t("workouts")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="weekly-duration-goal-enabled" className="text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    {t("weeklyDurationGoal")}
                  </span>
                </Label>
              </div>
              <Switch
                id="weekly-duration-goal-enabled"
                checked={weeklyDurationGoalEnabled}
                onCheckedChange={onWeeklyDurationGoalToggle}
              />
            </div>
            <div className={`grid transition-all duration-200 ${weeklyDurationGoalEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <div className="relative px-1 py-1.5">
                  <Input
                    id="weekly-duration-goal"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={weeklyDurationGoalDraft}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (/^[0-9]*$/.test(next)) {
                        setWeeklyDurationGoalDraft(next);
                      }
                    }}
                    onBlur={onWeeklyDurationGoalCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="pr-14"
                    disabled={!weeklyDurationGoalEnabled}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    min
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="weekly-weight-goal-enabled" className="text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Weight className="h-4 w-4 text-muted-foreground" />
                    {t("weeklyWeightGoal")}
                  </span>
                </Label>
              </div>
              <Switch
                id="weekly-weight-goal-enabled"
                checked={weeklyWeightGoalEnabled}
                onCheckedChange={onWeeklyWeightGoalToggle}
              />
            </div>
            <div className={`grid transition-all duration-200 ${weeklyWeightGoalEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <div className="relative px-1 py-1.5">
                  <Input
                    id="weekly-weight-goal"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={weeklyWeightGoalDraft}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (/^[0-9]*([.,][0-9]*)?$/.test(next) || next === "") {
                        setWeeklyWeightGoalDraft(next);
                      }
                    }}
                    onBlur={onWeeklyWeightGoalCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="pr-12"
                    disabled={!weeklyWeightGoalEnabled}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {weightUnit}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="weekly-calories-goal-enabled" className="text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Flame className="h-4 w-4 text-muted-foreground" />
                    {t("weeklyCaloriesGoal")}
                  </span>
                </Label>
              </div>
              <Switch
                id="weekly-calories-goal-enabled"
                checked={weeklyCaloriesGoalEnabled}
                onCheckedChange={onWeeklyCaloriesGoalToggle}
              />
            </div>
            <div className={`grid transition-all duration-200 ${weeklyCaloriesGoalEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <div className="relative px-1 py-1.5">
                  <Input
                    id="weekly-calories-goal"
                    inputMode="numeric"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={weeklyCaloriesGoalDraft}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (/^[0-9]*([.,][0-9]*)?$/.test(next) || next === "") {
                        setWeeklyCaloriesGoalDraft(next);
                      }
                    }}
                    onBlur={onWeeklyCaloriesGoalCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="pr-14"
                    disabled={!weeklyCaloriesGoalEnabled}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    kcal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
