import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  type LucideIcon,
  Clock3,
  Database,
  DoorClosedLocked,
  Download,
  Dumbbell,
  Flame,
  Globe,
  RotateCcw,
  Settings,
  SunMoon,
  Target,
  Timer,
  Upload,
  User,
  Weight,
  X
} from "lucide-react";
import { useSettings } from "@/app/settings-context";
import { APP_VERSION } from "@/app/version";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clearAllData,
  exportAllDataSnapshot,
  getSettings,
  getLatestUpdateSafetySnapshot,
  importAllDataSnapshot,
  restoreUpdateSafetySnapshot,
  updateSettings
} from "@/db/repository";
import type { AppLanguage, ColorScheme, WeightUnit } from "@/db/types";
import { createBackupPayload, parseBackupPayload, type AppBackupFile } from "@/features/settings/backup-utils";
import { toast } from "sonner";

const DISMISSED_SNAPSHOT_KEY = "gymtracker:dismissed-snapshot-id";
type SettingsTabKey = "app" | "personal" | "data";

function getSettingsTabFromHash(hash: string): SettingsTabKey {
  if (hash === "#data-import") return "data";
  if (hash === "#weekly-goals") return "personal";
  return "app";
}

interface SettingsCardTitleProps {
  icon: LucideIcon;
  children: ReactNode;
}

interface ToggleSettingRowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

interface TabsOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface OptionTabsCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  options: TabsOption[];
  onValueChange: (value: string) => void;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmClassName?: string;
}

function SettingsCardTitle({ icon: Icon, children }: SettingsCardTitleProps) {
  return (
    <CardTitle className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {children}
    </CardTitle>
  );
}

function ToggleSettingRow({ id, label, hint, checked, onCheckedChange }: ToggleSettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function OptionTabsCard({ icon, title, value, options, onValueChange }: OptionTabsCardProps) {
  return (
    <Card>
      <CardHeader>
        <SettingsCardTitle icon={icon}>{title}</SettingsCardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={value} onValueChange={onValueChange}>
          <TabsList className="w-full">
            {options.map((option) => (
              <TabsTrigger key={option.value} value={option.value} className="flex-1" disabled={option.disabled}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  confirmClassName
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button className={confirmClassName} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const {
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
    setColorScheme
  } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(() => getSettingsTabFromHash(location.hash));
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<AppBackupFile | null>(null);
  const [pendingImportFileName, setPendingImportFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);
  const [dismissedSnapshotId, setDismissedSnapshotId] = useState<number | null>(() => {
    const stored = localStorage.getItem(DISMISSED_SNAPSHOT_KEY);
    return stored ? Number(stored) : null;
  });

  const latestUpdateSnapshot = useLiveQuery(async () => getLatestUpdateSafetySnapshot(), []);
  const settingsRecord = useLiveQuery(async () => getSettings(), []);
  const [bodyWeightDraft, setBodyWeightDraft] = useState("");
  const [weeklyWeightGoalDraft, setWeeklyWeightGoalDraft] = useState("");
  const [weeklyCaloriesGoalDraft, setWeeklyCaloriesGoalDraft] = useState("");
  const [weeklyWorkoutCountGoalDraft, setWeeklyWorkoutCountGoalDraft] = useState("");
  const [weeklyDurationGoalDraft, setWeeklyDurationGoalDraft] = useState("");
  const [weeklyWeightGoalEnabled, setWeeklyWeightGoalEnabled] = useState(false);
  const [weeklyCaloriesGoalEnabled, setWeeklyCaloriesGoalEnabled] = useState(false);
  const [weeklyWorkoutCountGoalEnabled, setWeeklyWorkoutCountGoalEnabled] = useState(false);
  const [weeklyDurationGoalEnabled, setWeeklyDurationGoalEnabled] = useState(false);

  const showSnapshotNotice = !!latestUpdateSnapshot && latestUpdateSnapshot.id !== dismissedSnapshotId;

  useEffect(() => {
    const value = settingsRecord?.bodyWeight;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      setBodyWeightDraft("");
    } else {
      setBodyWeightDraft(`${value}`.replace(/\.0+$/, ""));
    }

    const weeklyWeightGoal = settingsRecord?.weeklyWeightGoal;
    setWeeklyWeightGoalEnabled(typeof weeklyWeightGoal === "number" && Number.isFinite(weeklyWeightGoal) && weeklyWeightGoal > 0);
    setWeeklyWeightGoalDraft(
      typeof weeklyWeightGoal === "number" && Number.isFinite(weeklyWeightGoal)
        ? `${weeklyWeightGoal}`.replace(/\.0+$/, "")
        : ""
    );

    const weeklyCaloriesGoal = settingsRecord?.weeklyCaloriesGoal;
    setWeeklyCaloriesGoalEnabled(typeof weeklyCaloriesGoal === "number" && Number.isFinite(weeklyCaloriesGoal) && weeklyCaloriesGoal > 0);
    setWeeklyCaloriesGoalDraft(
      typeof weeklyCaloriesGoal === "number" && Number.isFinite(weeklyCaloriesGoal)
        ? String(Math.round(weeklyCaloriesGoal))
        : ""
    );

    const weeklyWorkoutCountGoal = settingsRecord?.weeklyWorkoutCountGoal;
    setWeeklyWorkoutCountGoalEnabled(
      typeof weeklyWorkoutCountGoal === "number" && Number.isFinite(weeklyWorkoutCountGoal) && weeklyWorkoutCountGoal > 0
    );
    setWeeklyWorkoutCountGoalDraft(
      typeof weeklyWorkoutCountGoal === "number" && Number.isFinite(weeklyWorkoutCountGoal)
        ? String(Math.round(weeklyWorkoutCountGoal))
        : ""
    );

    const weeklyDurationGoal = settingsRecord?.weeklyDurationGoal;
    setWeeklyDurationGoalEnabled(
      typeof weeklyDurationGoal === "number" && Number.isFinite(weeklyDurationGoal) && weeklyDurationGoal > 0
    );
    setWeeklyDurationGoalDraft(
      typeof weeklyDurationGoal === "number" && Number.isFinite(weeklyDurationGoal)
        ? String(Math.round(weeklyDurationGoal))
        : ""
    );
  }, [
    settingsRecord?.bodyWeight,
    settingsRecord?.weeklyWeightGoal,
    settingsRecord?.weeklyCaloriesGoal,
    settingsRecord?.weeklyWorkoutCountGoal,
    settingsRecord?.weeklyDurationGoal
  ]);

  useEffect(() => {
    if (location.hash === "#data-import") {
      setActiveTab("data");
    } else if (location.hash === "#weekly-goals") {
      setActiveTab("personal");
    } else {
      return;
    }

    window.requestAnimationFrame(() => {
      const targetId = location.hash.slice(1);
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [location.hash]);

  const handleDismissSnapshot = () => {
    if (latestUpdateSnapshot?.id) {
      localStorage.setItem(DISMISSED_SNAPSHOT_KEY, String(latestUpdateSnapshot.id));
      setDismissedSnapshotId(latestUpdateSnapshot.id);
    }
  };

  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "English" }
  ];

  const weightOptions: Array<{ value: WeightUnit; label: string }> = [
    { value: "kg", label: "kg" },
    { value: "lb", label: "lb" }
  ];

  const colorSchemeOptions: Array<{ value: ColorScheme; labelKey: "colorSchemeLight" | "colorSchemeDark" | "colorSchemeSystem" }> = [
    { value: "light", labelKey: "colorSchemeLight" },
    { value: "dark", labelKey: "colorSchemeDark" },
    { value: "system", labelKey: "colorSchemeSystem" }
  ];
  const restTimerLengthOptions: TabsOption[] = [
    { value: "60", label: "1 min", disabled: !restTimerEnabled },
    { value: "120", label: "2 min", disabled: !restTimerEnabled },
    { value: "180", label: "3 min", disabled: !restTimerEnabled },
    { value: "300", label: "5 min", disabled: !restTimerEnabled }
  ];
  const handleClearAllData = async () => {
    await clearAllData();
    setClearDialogOpen(false);
    toast.success(t("allDataDeleted"));
  };

  const handleExportAllData = async () => {
    try {
      const snapshot = await exportAllDataSnapshot();
      const payload = createBackupPayload(snapshot, APP_VERSION);
      const serialized = JSON.stringify(payload, null, 2);
      const blob = new Blob([serialized], { type: "application/json" });
      const fileName = `gymtracker-backup-v${APP_VERSION}-${new Date().toISOString().slice(0, 10)}.json`;
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      toast.success(t("backupExportSuccess"));
    } catch {
      toast.error(t("backupExportFailed"));
    }
  };

  const handleBackupFileUpload: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setPendingImport(null);
        setPendingImportFileName(file.name);
        toast.error(t("invalidBackupFile"));
        return;
      }

      const result = parseBackupPayload(parsed);
      if (!result.success) {
        setPendingImport(null);
        setPendingImportFileName(file.name);
        toast.error(t("invalidBackupFile"));
        return;
      }

      setPendingImport(result.data);
      setPendingImportFileName(file.name);
      toast.success(t("backupFileReady"));
    };
    reader.onerror = () => {
      setPendingImport(null);
      setPendingImportFileName(file.name);
      toast.error(t("invalidBackupFile"));
    };
    reader.readAsText(file);
    event.currentTarget.value = "";
  };

  const handleImportAllData = async () => {
    if (!pendingImport) return;

    setIsImporting(true);
    try {
      await importAllDataSnapshot(pendingImport.data);
      setImportDialogOpen(false);
      toast.success(t("backupImportSuccess"));
      navigate("/");
    } catch {
      toast.error(t("backupImportFailed"));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRestoreUpdateSnapshot = async () => {
    if (!latestUpdateSnapshot?.id) return;

    setIsRestoringSnapshot(true);
    try {
      await restoreUpdateSafetySnapshot(latestUpdateSnapshot.id);
      setRestoreDialogOpen(false);
      toast.success(t("updateSafetyRestoreSuccess"));
    } catch {
      toast.error(t("updateSafetyRestoreFailed"));
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const handleBodyWeightCommit = async () => {
    const normalized = bodyWeightDraft.replace(",", ".").trim();
    if (!normalized) {
      await updateSettings({ bodyWeight: undefined });
      setBodyWeightDraft("");
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setBodyWeightDraft(
        typeof settingsRecord?.bodyWeight === "number" && Number.isFinite(settingsRecord.bodyWeight)
          ? String(settingsRecord.bodyWeight)
          : ""
      );
      return;
    }

    const rounded = Math.round(parsed * 10) / 10;
    await updateSettings({ bodyWeight: rounded });
    setBodyWeightDraft(String(rounded));
  };

  const handleWeeklyWeightGoalCommit = async () => {
    const normalized = weeklyWeightGoalDraft.replace(",", ".").trim();
    if (!normalized) {
      await updateSettings({ weeklyWeightGoal: undefined });
      setWeeklyWeightGoalDraft("");
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWeeklyWeightGoalDraft(
        typeof settingsRecord?.weeklyWeightGoal === "number" && Number.isFinite(settingsRecord.weeklyWeightGoal)
          ? String(settingsRecord.weeklyWeightGoal).replace(/\.0+$/, "")
          : ""
      );
      return;
    }

    const rounded = Math.round(parsed * 10) / 10;
    await updateSettings({ weeklyWeightGoal: rounded });
    setWeeklyWeightGoalDraft(String(rounded));
  };

  const handleWeeklyCaloriesGoalCommit = async () => {
    const normalized = weeklyCaloriesGoalDraft.replace(",", ".").trim();
    if (!normalized) {
      await updateSettings({ weeklyCaloriesGoal: undefined });
      setWeeklyCaloriesGoalDraft("");
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWeeklyCaloriesGoalDraft(
        typeof settingsRecord?.weeklyCaloriesGoal === "number" && Number.isFinite(settingsRecord.weeklyCaloriesGoal)
          ? String(Math.round(settingsRecord.weeklyCaloriesGoal))
          : ""
      );
      return;
    }

    const rounded = Math.max(1, Math.round(parsed));
    await updateSettings({ weeklyCaloriesGoal: rounded });
    setWeeklyCaloriesGoalDraft(String(rounded));
  };

  const handleWeeklyWorkoutCountGoalCommit = async () => {
    const normalized = weeklyWorkoutCountGoalDraft.trim();
    if (!normalized) {
      await updateSettings({ weeklyWorkoutCountGoal: undefined });
      setWeeklyWorkoutCountGoalDraft("");
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWeeklyWorkoutCountGoalDraft(
        typeof settingsRecord?.weeklyWorkoutCountGoal === "number" && Number.isFinite(settingsRecord.weeklyWorkoutCountGoal)
          ? String(Math.round(settingsRecord.weeklyWorkoutCountGoal))
          : ""
      );
      return;
    }

    const rounded = Math.max(1, Math.round(parsed));
    await updateSettings({ weeklyWorkoutCountGoal: rounded });
    setWeeklyWorkoutCountGoalDraft(String(rounded));
  };

  const handleWeeklyDurationGoalCommit = async () => {
    const normalized = weeklyDurationGoalDraft.trim();
    if (!normalized) {
      await updateSettings({ weeklyDurationGoal: undefined });
      setWeeklyDurationGoalDraft("");
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWeeklyDurationGoalDraft(
        typeof settingsRecord?.weeklyDurationGoal === "number" && Number.isFinite(settingsRecord.weeklyDurationGoal)
          ? String(Math.round(settingsRecord.weeklyDurationGoal))
          : ""
      );
      return;
    }

    const rounded = Math.max(1, Math.round(parsed));
    await updateSettings({ weeklyDurationGoal: rounded });
    setWeeklyDurationGoalDraft(String(rounded));
  };

  const handleWeeklyWorkoutGoalToggle = async (checked: boolean) => {
    setWeeklyWorkoutCountGoalEnabled(checked);
    if (!checked) {
      await updateSettings({ weeklyWorkoutCountGoal: undefined });
    }
  };

  const handleWeeklyCaloriesGoalToggle = async (checked: boolean) => {
    setWeeklyCaloriesGoalEnabled(checked);
    if (!checked) {
      await updateSettings({ weeklyCaloriesGoal: undefined });
    }
  };

  const handleWeeklyWeightGoalToggle = async (checked: boolean) => {
    setWeeklyWeightGoalEnabled(checked);
    if (!checked) {
      await updateSettings({ weeklyWeightGoal: undefined });
    }
  };

  const handleWeeklyDurationGoalToggle = async (checked: boolean) => {
    setWeeklyDurationGoalEnabled(checked);
    if (!checked) {
      await updateSettings({ weeklyDurationGoal: undefined });
    }
  };

  return (
    <section className="space-y-4">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTabKey)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="app" className="flex gap-2">
            <Settings className="h-4 w-4" />
            {t("appSettingsTab")}
          </TabsTrigger>
          <TabsTrigger value="personal" className="flex gap-2">
            <User className="h-4 w-4" />
            {t("personalTab")}
          </TabsTrigger>
          <TabsTrigger value="data" className="flex gap-2">
            <Database className="h-4 w-4" />
            {t("dataManagementTab")}
          </TabsTrigger>
        </TabsList>

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
                onCheckedChange={(checked) => void setLockerNoteEnabled(checked)}
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
                onCheckedChange={(checked) => void setRestTimerEnabled(checked)}
              />
              <div className={`grid transition-all duration-200 ${restTimerEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="space-y-1 pb-1">
                    <Label htmlFor="rest-timer-length">{t("restTimerLengthLabel")}</Label>
                    <Tabs value={String(restTimerSeconds)} onValueChange={(value) => void setRestTimerSeconds(Number(value))}>
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
              onValueChange={(value) => void setLanguage(value as AppLanguage)}
              options={languageOptions}
            />
            <OptionTabsCard
              icon={Weight}
              title={t("unit")}
              value={weightUnit}
              onValueChange={(value) => void setWeightUnit(value as WeightUnit)}
              options={weightOptions}
            />
          </div>

          <OptionTabsCard
            icon={SunMoon}
            title={t("colorScheme")}
            value={colorScheme}
            onValueChange={(value) => void setColorScheme(value as ColorScheme)}
            options={colorSchemeOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey)
            }))}
          />
        </TabsContent>

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
                    onBlur={() => void handleBodyWeightCommit()}
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
                    onCheckedChange={(checked) => void handleWeeklyWorkoutGoalToggle(checked)}
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
                        onBlur={() => void handleWeeklyWorkoutCountGoalCommit()}
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
                    onCheckedChange={(checked) => void handleWeeklyDurationGoalToggle(checked)}
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
                        onBlur={() => void handleWeeklyDurationGoalCommit()}
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
                    onCheckedChange={(checked) => void handleWeeklyWeightGoalToggle(checked)}
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
                        onBlur={() => void handleWeeklyWeightGoalCommit()}
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
                    onCheckedChange={(checked) => void handleWeeklyCaloriesGoalToggle(checked)}
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
                        onBlur={() => void handleWeeklyCaloriesGoalCommit()}
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

        <TabsContent value="data" className="space-y-4">
          {showSnapshotNotice && latestUpdateSnapshot && (
            <div className="relative space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded text-amber-700 hover:bg-amber-100 hover:text-amber-900"
                aria-label={t("dismiss")}
                onClick={handleDismissSnapshot}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="pr-6 font-medium">{t("updateSafetySnapshotAvailable")}</p>
              <p>{latestUpdateSnapshot.previousAppVersion ?? "-"} → {latestUpdateSnapshot.appVersion}</p>
              <p>{new Date(latestUpdateSnapshot.createdAt).toLocaleString(language)}</p>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-300 bg-white hover:bg-amber-100"
                onClick={() => setRestoreDialogOpen(true)}
              >
                {t("restoreUpdateSafetySnapshot")}
              </Button>
            </div>
          )}

          <Card id="data-import" className="scroll-mt-20">
            <CardHeader>
              <SettingsCardTitle icon={Database}>{t("dataExportImport")}</SettingsCardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("dataExportHint")}</p>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => void handleExportAllData()}>
                <Upload className="h-4 w-4" />
                {t("exportAllData")}
              </Button>
              <p className="border-t pt-3 text-sm text-muted-foreground">{t("dataImportHint")}</p>
              <div className="space-y-2">
                <Input type="file" accept="application/json,.json,text/plain" onChange={handleBackupFileUpload} />
                <p className="text-xs text-muted-foreground">{pendingImportFileName ?? t("noFileLoaded")}</p>
                {pendingImport && (
                  <div className="space-y-1 rounded-md border p-2 text-xs text-muted-foreground">
                    <p>{t("backupFileReady")}</p>
                    <p>{pendingImport.data.workouts.length} {t("workouts")}</p>
                    <p>{pendingImport.data.sessions.length} {t("sessions")}</p>
                    <p>{new Date(pendingImport.exportedAt).toLocaleString(language)}</p>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={!pendingImport}
                onClick={() => setImportDialogOpen(true)}
              >
                <Download className="h-4 w-4" />
                {t("importAllData")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SettingsCardTitle icon={RotateCcw}>{t("reset")}</SettingsCardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={() => setClearDialogOpen(true)}
              >
                {t("clearAllData")}
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">{t("versionLabel")} {APP_VERSION}</p>
        </TabsContent>
      </Tabs>

      <footer className="border-t pt-4">
        <div className="flex flex-col gap-1 text-center text-xs text-muted-foreground">
          <p>
            {t("footerMadeWith")} <span className="text-foreground">❤</span> {t("footerBy")}{" "}
            <a
              href="https://github.com/christianphilie/gymtracker"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              christianphilie
            </a>
          </p>
          <p>
            <Link to="/legal" className="underline-offset-4 hover:underline">
              {t("legal")}
            </Link>
            {" · "}
            <Link to="/privacy" className="underline-offset-4 hover:underline">
              {t("privacy")}
            </Link>
          </p>
        </div>
      </footer>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title={t("clearAllData")}
        description={t("clearAllDataConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("clearAllData")}
        confirmClassName="border-red-300 bg-red-600 text-white hover:bg-red-700"
        onConfirm={() => void handleClearAllData()}
      />

      <ConfirmDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        title={t("restoreUpdateSafetySnapshot")}
        description={t("restoreUpdateSafetySnapshotConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("restoreUpdateSafetySnapshot")}
        confirmDisabled={isRestoringSnapshot || !latestUpdateSnapshot?.id}
        onConfirm={() => void handleRestoreUpdateSnapshot()}
      />

      <ConfirmDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title={t("importAllData")}
        description={t("importAllDataConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("importAllData")}
        confirmDisabled={isImporting || !pendingImport}
        onConfirm={() => void handleImportAllData()}
      />
    </section>
  );
}
