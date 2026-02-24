import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Database, DoorClosedLocked, Download, Globe, Settings, SunMoon, Timer, Upload, User, Weight, X } from "lucide-react";
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

  const showSnapshotNotice = !!latestUpdateSnapshot && latestUpdateSnapshot.id !== dismissedSnapshotId;

  useEffect(() => {
    const value = settingsRecord?.bodyWeight;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      setBodyWeightDraft("");
      return;
    }
    setBodyWeightDraft(`${value}`.replace(/\.0+$/, ""));
  }, [settingsRecord?.bodyWeight]);

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

  return (
    <section className="space-y-4">
      <h1 className="inline-flex items-center gap-2 text-base font-semibold">
        <Settings className="h-4 w-4" />
        {t("settings")}
      </h1>

      <Tabs defaultValue="app" className="space-y-4">
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
              <CardTitle className="inline-flex items-center gap-2">
                <Timer className="h-4 w-4" />
                {t("restTimerDuration")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="rest-timer-enabled" className="text-sm">
                    {t("restTimerShowToggle")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("restTimerShowToggleHint")}</p>
                </div>
                <Switch
                  id="rest-timer-enabled"
                  checked={restTimerEnabled}
                  onCheckedChange={(checked) => void setRestTimerEnabled(checked)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rest-timer-length">{t("restTimerLengthLabel")}</Label>
                <Tabs value={String(restTimerSeconds)} onValueChange={(value) => void setRestTimerSeconds(Number(value))}>
                  <TabsList className="w-full">
                    <TabsTrigger value="60" className="flex-1" disabled={!restTimerEnabled}>1 min</TabsTrigger>
                    <TabsTrigger value="120" className="flex-1" disabled={!restTimerEnabled}>2 min</TabsTrigger>
                    <TabsTrigger value="180" className="flex-1" disabled={!restTimerEnabled}>3 min</TabsTrigger>
                    <TabsTrigger value="300" className="flex-1" disabled={!restTimerEnabled}>5 min</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <p className="text-xs text-muted-foreground">{t("restTimerDescription")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <DoorClosedLocked className="h-4 w-4" />
                {t("lockerNoteSettingTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="locker-note-enabled" className="text-sm">
                    {t("lockerNoteToggle")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("lockerNoteToggleHint")}</p>
                </div>
                <Switch
                  id="locker-note-enabled"
                  checked={lockerNoteEnabled}
                  onCheckedChange={(checked) => void setLockerNoteEnabled(checked)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="inline-flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {t("language")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={language} onValueChange={(value) => void setLanguage(value as AppLanguage)}>
                  <TabsList className="w-full">
                    {languageOptions.map((option) => (
                      <TabsTrigger key={option.value} value={option.value} className="flex-1">
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="inline-flex items-center gap-2">
                  <Weight className="h-4 w-4" />
                  {t("unit")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={weightUnit} onValueChange={(value) => void setWeightUnit(value as WeightUnit)}>
                  <TabsList className="w-full">
                    {weightOptions.map((option) => (
                      <TabsTrigger key={option.value} value={option.value} className="flex-1">
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <SunMoon className="h-4 w-4" />
                {t("colorScheme")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={colorScheme} onValueChange={(value) => void setColorScheme(value as ColorScheme)}>
                <TabsList className="w-full">
                  {colorSchemeOptions.map((option) => (
                    <TabsTrigger key={option.value} value={option.value} className="flex-1">
                      {t(option.labelKey)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <Weight className="h-4 w-4" />
                {t("bodyWeight")}
              </CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle>{t("dataExportImport")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("dataExportHint")}</p>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => void handleExportAllData()}>
                <Upload className="h-4 w-4" />
                {t("exportAllData")}
              </Button>
              <p className="border-t pt-3 text-xs text-muted-foreground">{t("dataExportImportDivider")}</p>
              <p className="text-sm text-muted-foreground">{t("dataImportHint")}</p>
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
              <CardTitle>{t("reset")}</CardTitle>
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

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearAllData")}</DialogTitle>
            <DialogDescription>{t("clearAllDataConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>{t("cancel")}</Button>
            <Button className="border-red-300 bg-red-600 text-white hover:bg-red-700" onClick={() => void handleClearAllData()}>
              {t("clearAllData")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("restoreUpdateSafetySnapshot")}</DialogTitle>
            <DialogDescription>{t("restoreUpdateSafetySnapshotConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>{t("cancel")}</Button>
            <Button
              disabled={isRestoringSnapshot || !latestUpdateSnapshot?.id}
              onClick={() => void handleRestoreUpdateSnapshot()}
            >
              {t("restoreUpdateSafetySnapshot")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("importAllData")}</DialogTitle>
            <DialogDescription>{t("importAllDataConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>{t("cancel")}</Button>
            <Button disabled={isImporting || !pendingImport} onClick={() => void handleImportAllData()}>
              {t("importAllData")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
