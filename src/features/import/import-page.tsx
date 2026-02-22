import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/app/settings-context";
import { APP_VERSION } from "@/app/version";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { importWorkouts } from "@/db/repository";
import { getPromptTemplate, repairImportPayload, type RepairResult } from "@/features/import/import-utils";

export function ImportPage() {
  const { t, language } = useSettings();
  const navigate = useNavigate();
  const [rawInput, setRawInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [activeTab, setActiveTab] = useState("paste");
  const [isImporting, setIsImporting] = useState(false);
  const [aiPlanText, setAiPlanText] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const canValidate = rawInput.trim().length > 0;
  const hasPreview = (repairResult?.drafts.length ?? 0) > 0 && (repairResult?.errors.length ?? 0) === 0;

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(rawInput);
      const result = repairImportPayload(parsed);
      setRepairResult(result);

      if (result.errors.length > 0) {
        toast.error(t("invalidImport"));
      } else {
        toast.success(t("previewImport"));
      }
    } catch {
      setRepairResult({
        repairedObject: null,
        drafts: [],
        changes: [],
        errors: ["Invalid JSON"]
      });
      toast.error(t("invalidImport"));
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPlanText.trim()) {
      return;
    }

    setIsAiLoading(true);
    try {
      const response = await fetch("/api/ai-import", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          locale: language,
          planText: aiPlanText.trim(),
          appVersion: APP_VERSION,
          promptTemplate
        })
      });

      if (!response.ok) {
        toast.error(t("aiImportFailed"));
        return;
      }

      const payload = (await response.json()) as { jsonText?: string };
      if (!payload.jsonText) {
        toast.error(t("aiImportFailed"));
        return;
      }

      setRawInput(payload.jsonText);
      setActiveTab("paste");
      toast.success(t("aiImportReady"));
    } catch {
      toast.error(t("aiImportFailed"));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleFileUpload: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setRawInput(text);
      setActiveTab("paste");
      toast.success(t("fileLoaded"));
    };
    reader.onerror = () => {
      toast.error(t("invalidImport"));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!repairResult || repairResult.errors.length > 0 || repairResult.drafts.length === 0) {
      return;
    }

    setIsImporting(true);
    try {
      await importWorkouts(repairResult.drafts);
      toast.success(t("importSuccess"));
      navigate("/");
    } finally {
      setIsImporting(false);
    }
  };

  const promptTemplate = useMemo(() => getPromptTemplate(language), [language]);

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("workoutsImport")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("promptHelp")}</p>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(promptTemplate);
              toast.success(t("copyPrompt"));
            }}
          >
            {t("copyPrompt")}
          </Button>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="paste">{t("pasteJson")}</TabsTrigger>
              <TabsTrigger value="file">{t("uploadJsonFile")}</TabsTrigger>
              <TabsTrigger value="ai">{t("aiImport")}</TabsTrigger>
            </TabsList>
            <TabsContent value="paste">
              <Textarea
                className="mono-text min-h-[220px]"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder='{"schemaVersion":"1.0",...}'
              />
            </TabsContent>
            <TabsContent value="file" className="space-y-2">
              <Input type="file" accept="application/json,.json,text/plain" onChange={handleFileUpload} />
              <p className="text-xs text-muted-foreground">{fileName ?? t("noFileLoaded")}</p>
            </TabsContent>
            <TabsContent value="ai" className="space-y-2">
              <Textarea
                className="min-h-[200px]"
                value={aiPlanText}
                onChange={(event) => setAiPlanText(event.target.value)}
                placeholder={t("aiImportPlaceholder")}
              />
              <Button disabled={!aiPlanText.trim() || isAiLoading} onClick={() => void handleAiGenerate()}>
                {t("aiGenerate")}
              </Button>
            </TabsContent>
          </Tabs>

          <Button disabled={!canValidate} onClick={handleValidate}>
            {t("buildPreview")}
          </Button>
        </CardContent>
      </Card>

      {repairResult && (
        <Card>
          <CardHeader>
            <CardTitle>{t("importOverview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {repairResult.errors.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {repairResult.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}

            {repairResult.errors.length === 0 && (
              <>
                {repairResult.changes.length === 0 && <p className="text-sm text-muted-foreground">{t("noChangesNeeded")}</p>}

                {repairResult.changes.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {repairResult.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                )}

                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{t("previewImport")}</p>
                  {repairResult.drafts.map((workout) => (
                    <div key={workout.name} className="rounded-md border p-2 text-sm">
                      <p className="font-medium">{workout.name}</p>
                      <p className="text-xs text-muted-foreground">{workout.exercises.length} {t("exercises")}</p>
                    </div>
                  ))}
                </div>

                <Button disabled={!hasPreview || isImporting} onClick={handleImport}>
                  {t("importPlan")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
