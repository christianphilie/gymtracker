import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/app/settings-context";
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
          <CardTitle>{t("import")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
              <TabsTrigger value="file">{t("uploadFile")}</TabsTrigger>
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
          </Tabs>

          <Button disabled={!canValidate} onClick={handleValidate}>
            {t("validate")}
          </Button>
        </CardContent>
      </Card>

      {repairResult && (
        <Card>
          <CardHeader>
            <CardTitle>{t("repairPreview")}</CardTitle>
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
                {repairResult.changes.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("noRepairNeeded")}</p>
                )}

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
