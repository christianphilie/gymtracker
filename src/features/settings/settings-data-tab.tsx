import { Database, Download, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import type { UpdateSafetySnapshot } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import type { AppBackupFile } from "@/features/settings/backup-utils";
import { SettingsCardTitle } from "@/features/settings/settings-page-primitives";

interface SettingsDataTabProps {
  t: (key: TranslationKey) => string;
  language: "de" | "en";
  appVersion: string;
  showSnapshotNotice: boolean;
  latestUpdateSnapshot: UpdateSafetySnapshot | undefined;
  onDismissSnapshot: () => void;
  onOpenRestoreDialog: () => void;
  onExportAllData: () => void;
  onBackupFileUpload: React.ChangeEventHandler<HTMLInputElement>;
  pendingImportFileName: string | null;
  pendingImport: AppBackupFile | null;
  onOpenImportDialog: () => void;
  onOpenClearDialog: () => void;
}

export function SettingsDataTab({
  t,
  language,
  appVersion,
  showSnapshotNotice,
  latestUpdateSnapshot,
  onDismissSnapshot,
  onOpenRestoreDialog,
  onExportAllData,
  onBackupFileUpload,
  pendingImportFileName,
  pendingImport,
  onOpenImportDialog,
  onOpenClearDialog
}: SettingsDataTabProps) {
  return (
    <TabsContent value="data" className="space-y-4">
      {showSnapshotNotice && latestUpdateSnapshot && (
        <div className="relative space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded text-amber-700 hover:bg-amber-100 hover:text-amber-900"
            aria-label={t("dismiss")}
            onClick={onDismissSnapshot}
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
            onClick={onOpenRestoreDialog}
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
          <Button variant="outline" className="w-full justify-start gap-2" onClick={onExportAllData}>
            <Upload className="h-4 w-4" />
            {t("exportAllData")}
          </Button>
          <p className="border-t pt-3 text-sm text-muted-foreground">{t("dataImportHint")}</p>
          <div className="space-y-2">
            <Input type="file" accept="application/json,.json,text/plain" onChange={onBackupFileUpload} />
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
            onClick={onOpenImportDialog}
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
            onClick={onOpenClearDialog}
          >
            {t("clearAllData")}
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">{t("versionLabel")} {appVersion}</p>
    </TabsContent>
  );
}
