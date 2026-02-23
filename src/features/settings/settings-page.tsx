import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Database, Download, Globe, Settings, SunMoon, Timer, Upload, Weight, X } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clearAllData,
  exportAllDataSnapshot,
  getLatestUpdateSafetySnapshot,
  importAllDataSnapshot,
  restoreUpdateSafetySnapshot
} from "@/db/repository";
import type { AppLanguage, ColorScheme, WeightUnit } from "@/db/types";
import { createBackupPayload, parseBackupPayload, type AppBackupFile } from "@/features/settings/backup-utils";
import { toast } from "sonner";

const DISMISSED_SNAPSHOT_KEY = "gymtracker:dismissed-snapshot-id";

export function SettingsPage() {
  const { t, language, setLanguage, weightUnit, setWeightUnit, restTimerSeconds, setRestTimerSeconds, colorScheme, setColorScheme } = useSettings();
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

  const showSnapshotNotice = !!latestUpdateSnapshot && latestUpdateSnapshot.id !== dismissedSnapshotId;

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
    { value: "lb", label: "lbs" }
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

  return (
    <section className="space-y-4">
      <h1 className="inline-flex items-center gap-2 text-base font-semibold">
        <Settings className="h-4 w-4" />
        {t("settings")}
      </h1>

      {/* Satzpausen-Timer – first */}
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Timer className="h-4 w-4" />
            {t("restTimerDuration")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={String(restTimerSeconds)} onValueChange={(value) => void setRestTimerSeconds(Number(value))}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="120">2 min</TabsTrigger>
              <TabsTrigger value="180">3 min</TabsTrigger>
              <TabsTrigger value="300">5 min</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">{t("restTimerDescription")}</p>
        </CardContent>
      </Card>

      {/* Sprache + Einheit side by side at md */}
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
              <TabsList className="grid w-full grid-cols-2">
                {languageOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
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
              <TabsList className="grid w-full grid-cols-2">
                {weightOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Erscheinungsbild */}
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <SunMoon className="h-4 w-4" />
            {t("colorScheme")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={colorScheme} onValueChange={(value) => void setColorScheme(value as ColorScheme)}>
            <TabsList className="grid w-full grid-cols-3">
              {colorSchemeOptions.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Datenverwaltung section heading */}
      <h2 className="inline-flex items-center gap-2 text-base font-semibold">
        <Database className="h-4 w-4" />
        {t("dataManagement")}
      </h2>

      {/* Update safety notice – dismissable */}
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

      {/* Export / Import */}
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

      {/* Reset */}
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
