import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Clock3,
  Database,
  Download,
  Dumbbell,
  Flame,
  RotateCcw,
  Settings,
  Target,
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
import { SettingsAppTab } from "@/features/settings/settings-app-tab";
import { SettingsDataTab } from "@/features/settings/settings-data-tab";
import { SettingsPersonalTab } from "@/features/settings/settings-personal-tab";
import {
  ConfirmDialog,
  OptionTabsCard,
  SettingsCardTitle,
  type TabsOption
} from "@/features/settings/settings-page-primitives";
import { toast } from "sonner";

const DISMISSED_SNAPSHOT_KEY = "gymtracker:dismissed-snapshot-id";
type SettingsTabKey = "app" | "personal" | "data";

function getSettingsTabFromHash(hash: string): SettingsTabKey {
  if (hash === "#data-import") return "data";
  if (hash === "#weekly-goals") return "personal";
  return "app";
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

        <SettingsAppTab
          t={t}
          language={language}
          setLanguage={(value) => void setLanguage(value)}
          weightUnit={weightUnit}
          setWeightUnit={(value) => void setWeightUnit(value)}
          restTimerSeconds={restTimerSeconds}
          restTimerEnabled={restTimerEnabled}
          setRestTimerEnabled={(value) => void setRestTimerEnabled(value)}
          setRestTimerSeconds={(value) => void setRestTimerSeconds(value)}
          lockerNoteEnabled={lockerNoteEnabled}
          setLockerNoteEnabled={(value) => void setLockerNoteEnabled(value)}
          colorScheme={colorScheme}
          setColorScheme={(value) => void setColorScheme(value)}
          languageOptions={languageOptions}
          weightOptions={weightOptions}
          colorSchemeOptions={colorSchemeOptions.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          restTimerLengthOptions={restTimerLengthOptions}
        />

        <SettingsPersonalTab
          t={t}
          weightUnit={weightUnit}
          bodyWeightDraft={bodyWeightDraft}
          setBodyWeightDraft={setBodyWeightDraft}
          onBodyWeightCommit={() => void handleBodyWeightCommit()}
          weeklyWorkoutCountGoalDraft={weeklyWorkoutCountGoalDraft}
          setWeeklyWorkoutCountGoalDraft={setWeeklyWorkoutCountGoalDraft}
          weeklyWorkoutCountGoalEnabled={weeklyWorkoutCountGoalEnabled}
          onWeeklyWorkoutGoalToggle={(checked) => void handleWeeklyWorkoutGoalToggle(checked)}
          onWeeklyWorkoutCountGoalCommit={() => void handleWeeklyWorkoutCountGoalCommit()}
          weeklyDurationGoalDraft={weeklyDurationGoalDraft}
          setWeeklyDurationGoalDraft={setWeeklyDurationGoalDraft}
          weeklyDurationGoalEnabled={weeklyDurationGoalEnabled}
          onWeeklyDurationGoalToggle={(checked) => void handleWeeklyDurationGoalToggle(checked)}
          onWeeklyDurationGoalCommit={() => void handleWeeklyDurationGoalCommit()}
          weeklyWeightGoalDraft={weeklyWeightGoalDraft}
          setWeeklyWeightGoalDraft={setWeeklyWeightGoalDraft}
          weeklyWeightGoalEnabled={weeklyWeightGoalEnabled}
          onWeeklyWeightGoalToggle={(checked) => void handleWeeklyWeightGoalToggle(checked)}
          onWeeklyWeightGoalCommit={() => void handleWeeklyWeightGoalCommit()}
          weeklyCaloriesGoalDraft={weeklyCaloriesGoalDraft}
          setWeeklyCaloriesGoalDraft={setWeeklyCaloriesGoalDraft}
          weeklyCaloriesGoalEnabled={weeklyCaloriesGoalEnabled}
          onWeeklyCaloriesGoalToggle={(checked) => void handleWeeklyCaloriesGoalToggle(checked)}
          onWeeklyCaloriesGoalCommit={() => void handleWeeklyCaloriesGoalCommit()}
        />

        <SettingsDataTab
          t={t}
          language={language}
          appVersion={APP_VERSION}
          showSnapshotNotice={showSnapshotNotice}
          latestUpdateSnapshot={latestUpdateSnapshot ?? undefined}
          onDismissSnapshot={handleDismissSnapshot}
          onOpenRestoreDialog={() => setRestoreDialogOpen(true)}
          onExportAllData={() => void handleExportAllData()}
          onBackupFileUpload={handleBackupFileUpload}
          pendingImportFileName={pendingImportFileName}
          pendingImport={pendingImport}
          onOpenImportDialog={() => setImportDialogOpen(true)}
          onOpenClearDialog={() => setClearDialogOpen(true)}
        />
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
