import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownToLine, FileUp, LoaderCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SetValueDisplay } from "@/components/weights/weight-display";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import { importWorkouts } from "@/db/repository";
import {
  AI_IMPORT_ACCEPT_ATTRIBUTE,
  encodeAiImportFile,
  type EncodedAiImportFile
} from "@/features/import/import-file-utils";
import { repairImportPayload, type RepairResult } from "@/features/import/import-utils";

function formatFileSize(sizeBytes: number, language: "de" | "en") {
  const kiloBytes = sizeBytes / 1024;
  if (kiloBytes < 1024) {
    const rounded = kiloBytes >= 10 ? Math.round(kiloBytes) : Math.round(kiloBytes * 10) / 10;
    return `${rounded} KB`;
  }

  const megaBytes = sizeBytes / (1024 * 1024);
  const rounded = megaBytes >= 10 ? Math.round(megaBytes) : Math.round(megaBytes * 10) / 10;
  return language === "de" ? `${rounded} MB` : `${rounded} MB`;
}

export function ImportPage() {
  const { t, language, weightUnitLabel } = useSettings();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [aiErrorMessage, setAiErrorMessage] = useState("");
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [aiPlanText, setAiPlanText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);

  const hasPreview = (repairResult?.drafts.length ?? 0) > 0 && (repairResult?.errors.length ?? 0) === 0;
  const canGenerate = (aiPlanText.trim().length > 0 || !!selectedFile) && privacyConsentAccepted;

  const runValidation = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const result = repairImportPayload(parsed);
      setRepairResult(result);
      if (result.errors.length > 0) {
        setAiErrorMessage(t("aiImportInvalidResult"));
        toast.error(t("invalidImport"));
      } else {
        setAiErrorMessage("");
        toast.success(t("aiImportReady"));
      }
    } catch {
      setRepairResult({
        repairedObject: null,
        drafts: [],
        changes: [],
        errors: ["Invalid JSON"]
      });
      setAiErrorMessage(t("aiImportInvalidResult"));
      toast.error(t("invalidImport"));
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) {
      clearSelectedFile();
      return;
    }

    if (!AI_IMPORT_ACCEPT_ATTRIBUTE.split(",").includes(nextFile.type)) {
      clearSelectedFile();
      setAiErrorMessage("");
      toast.error(t("aiImportUnsupportedFile"));
      return;
    }

    setAiErrorMessage("");
    setRepairResult(null);
    setSelectedFile(nextFile);
    toast.success(t("fileLoaded"));
  };

  const handleAiGenerate = async () => {
    if (!canGenerate) {
      return;
    }

    setIsAiLoading(true);
    setAiErrorMessage("");
    setRepairResult(null);

    try {
      let file: EncodedAiImportFile | undefined;
      if (selectedFile) {
        file = await encodeAiImportFile(selectedFile);
      }

      const response = await fetch("/api/ai-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: language,
          planText: aiPlanText.trim(),
          ...(file ? { file } : {})
        })
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          userMessage?: string;
        };
        const errorText = `${errorPayload.error ?? ""} ${errorPayload.detail ?? ""}`;
        const userMessage =
          typeof errorPayload.userMessage === "string" && errorPayload.userMessage.trim()
            ? errorPayload.userMessage.trim()
            : "";

        if (errorText.includes("GEMINI_API_KEY") || errorText.includes("GOOGLE_API_KEY")) {
          setAiErrorMessage(t("aiImportProviderNotConfigured"));
          toast.error(t("aiImportProviderNotConfigured"));
        } else if (response.status === 413 || errorText.includes("too large")) {
          setAiErrorMessage(t("aiImportFileTooLarge"));
          toast.error(t("aiImportFileTooLarge"));
        } else if (errorText.includes("Unsupported file type")) {
          setAiErrorMessage(t("aiImportUnsupportedFile"));
          toast.error(t("aiImportUnsupportedFile"));
        } else if (userMessage) {
          setAiErrorMessage(userMessage);
          toast.error(userMessage);
        } else {
          setAiErrorMessage(t("aiImportFailedDetailed"));
          toast.error(t("aiImportFailed"));
        }
        return;
      }

      const payload = (await response.json()) as { jsonText?: string };
      if (!payload.jsonText) {
        setAiErrorMessage(t("aiImportFailedDetailed"));
        toast.error(t("aiImportFailed"));
        return;
      }

      setRawInput(payload.jsonText);
      runValidation(payload.jsonText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("file-too-large")) {
        setAiErrorMessage(t("aiImportFileTooLarge"));
        toast.error(t("aiImportFileTooLarge"));
      } else if (message.includes("unsupported-file-type")) {
        setAiErrorMessage(t("aiImportUnsupportedFile"));
        toast.error(t("aiImportUnsupportedFile"));
      } else {
        setAiErrorMessage(t("aiImportFailedDetailed"));
        toast.error(t("aiImportFailed"));
      }
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
      <Card>
        <CardContent className="space-y-4 pt-4">
          <Textarea
            className="min-h-[220px]"
            value={aiPlanText}
            onChange={(event) => {
              setAiPlanText(event.target.value);
              setAiErrorMessage("");
              setRepairResult(null);
            }}
            placeholder={t("aiImportPlaceholder")}
          />

          <div className="space-y-3 rounded-xl border border-dashed border-border/80 bg-secondary/20 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background">
                <FileUp className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{t("aiImportFileTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("optionalLabel")}</p>
              </div>
            </div>

            <Input ref={fileInputRef} type="file" accept={AI_IMPORT_ACCEPT_ATTRIBUTE} onChange={handleFileChange} />

            {selectedFile && (
              <div className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size, language)}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearSelectedFile}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t("clear")}</span>
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-secondary/20 p-3">
            <Checkbox
              id="ai-import-privacy-consent"
              checked={privacyConsentAccepted}
              onCheckedChange={(checked) => setPrivacyConsentAccepted(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="ai-import-privacy-consent" className="text-xs font-normal leading-relaxed text-muted-foreground">
              {t("aiImportPrivacyConsent")}
            </Label>
          </div>

          <Button
            variant={hasPreview ? "secondary" : "default"}
            className="w-full"
            disabled={!canGenerate || isAiLoading}
            onClick={() => void handleAiGenerate()}
          >
            {isAiLoading ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {isAiLoading ? t("aiImportGeneratingButton") : t("aiImportGenerateButton")}
          </Button>

          {aiErrorMessage && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {aiErrorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {repairResult && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            {repairResult.errors.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                <p className="text-sm font-medium text-red-700">{t("aiImportInvalidResult")}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                  {repairResult.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {repairResult.errors.length === 0 && (
              <>
                <div className="space-y-3">
                  {repairResult.drafts.map((workout) => (
                    <div key={workout.name} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-3 border-b pb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            <WorkoutNameLabel name={workout.name} icon={workout.icon} />
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {workout.exercises.length} {t("exercises")}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-3">
                        {workout.exercises.map((exercise, exerciseIndex) => (
                          <div key={`${workout.name}-${exercise.name}-${exerciseIndex}`} className="rounded-lg border bg-background/70 px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{exercise.name}</p>
                                {exercise.notes && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">{exercise.notes}</p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {exercise.x2Enabled && (
                                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    2×
                                  </span>
                                )}
                                {exercise.negativeWeightEnabled && (
                                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    −kg
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {exercise.sets.map((set, setIndex) => (
                                <div
                                  key={`${workout.name}-${exercise.name}-${setIndex}`}
                                  className="rounded-full border bg-card px-2.5 py-1 text-xs"
                                >
                                  <SetValueDisplay
                                    reps={set.targetReps}
                                    weight={set.targetWeight}
                                    weightUnitLabel={weightUnitLabel}
                                    className="gap-1 text-xs"
                                    iconClassName="size-3"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button className="w-full" disabled={!hasPreview || isImporting || !rawInput} onClick={handleImport}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
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
