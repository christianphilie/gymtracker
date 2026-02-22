import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Import, Sparkles } from "lucide-react";
import { useSettings } from "@/app/settings-context";
import { APP_VERSION } from "@/app/version";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { importWorkouts } from "@/db/repository";
import { getPromptTemplate, repairImportPayload, type RepairResult } from "@/features/import/import-utils";

export function ImportPage() {
  const { t, language } = useSettings();
  const navigate = useNavigate();
  const [rawInput, setRawInput] = useState("");
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [activeTab, setActiveTab] = useState("ai");
  const [isImporting, setIsImporting] = useState(false);
  const [aiPlanText, setAiPlanText] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const canValidate = rawInput.trim().length > 0;
  const hasPreview = (repairResult?.drafts.length ?? 0) > 0 && (repairResult?.errors.length ?? 0) === 0;

  const promptTemplate = useMemo(() => getPromptTemplate(language), [language]);

  const runValidation = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const result = repairImportPayload(parsed);
      setRepairResult(result);
      if (result.errors.length > 0) {
        toast.error(t("invalidImport"));
      } else {
        toast.success(t("aiImportReady"));
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

  const handleValidate = () => {
    runValidation(rawInput);
  };

  const handleAiGenerate = async () => {
    if (!aiPlanText.trim()) {
      return;
    }

    setIsAiLoading(true);
    setRepairResult(null);
    try {
      const response = await fetch("/api/ai-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      runValidation(payload.jsonText);
    } catch {
      toast.error(t("aiImportFailed"));
    } finally {
      setIsAiLoading(false);
    }
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

  return (
    <section className="space-y-4">
      <h1 className="inline-flex items-center gap-2 text-base font-semibold">
        <Import className="h-4 w-4" />
        {t("workoutsImport")}
      </h1>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="ai" className="flex-1">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {t("importFromText")}
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">
                {t("importFromFile")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("aiImportDescription")}</p>
              <Textarea
                className="min-h-[200px]"
                value={aiPlanText}
                onChange={(event) => setAiPlanText(event.target.value)}
                placeholder={t("aiImportPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("aiImportPrivacy")}</p>
              <Button
                className="w-full"
                disabled={!aiPlanText.trim() || isAiLoading}
                onClick={() => void handleAiGenerate()}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isAiLoading ? "..." : t("aiGenerate")}
              </Button>
            </TabsContent>

            <TabsContent value="manual" className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("importFromFileDescription")}</p>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(promptTemplate);
                  toast.success(t("copyPrompt"));
                }}
              >
                {t("copyPrompt")}
              </Button>
              <Textarea
                className="mono-text min-h-[220px]"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder='{"schemaVersion":"1.0",...}'
              />
              <Button disabled={!canValidate} onClick={handleValidate}>
                {t("buildPreview")}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {repairResult && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm font-medium">{t("importOverview")}</p>

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

                <Button className="w-full" disabled={!hasPreview || isImporting} onClick={handleImport}>
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
