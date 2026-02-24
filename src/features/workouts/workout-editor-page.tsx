import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, GripVertical, Loader2, NotebookPen, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DecimalInput } from "@/components/forms/decimal-input";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  createWorkout,
  deleteWorkout,
  getWorkoutById,
  updateWorkout,
  type WorkoutDraft
} from "@/db/repository";
import type { ExerciseAiInfo } from "@/db/types";
import { useSettings } from "@/app/settings-context";

interface WorkoutEditorPageProps {
  mode: "create" | "edit";
}

interface ExerciseInfoApiItem {
  inputName: string;
  targetMuscles: Array<{ muscle: string; involvementPercent: number }>;
  executionGuide: string;
  coachingTips: string[];
}

interface GenerateExerciseInfoOptions {
  forceRefresh?: boolean;
}

function createEmptyDraft(): WorkoutDraft {
  return {
    name: "",
    exercises: [
      {
        name: "",
        notes: "",
        x2Enabled: false,
        sets: [
          { targetReps: 10, targetWeight: 0 },
          { targetReps: 10, targetWeight: 0 },
          { targetReps: 10, targetWeight: 0 }
        ]
      }
    ]
  };
}

function reorderExercises(draft: WorkoutDraft, fromIndex: number, toIndex: number) {
  const next = structuredClone(draft);
  const [moved] = next.exercises.splice(fromIndex, 1);
  next.exercises.splice(toIndex, 0, moved);
  return next;
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase();
}

function isExerciseInfoApiItem(value: unknown): value is ExerciseInfoApiItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.inputName === "string" &&
    typeof item.executionGuide === "string" &&
    Array.isArray(item.coachingTips) &&
    Array.isArray(item.targetMuscles)
  );
}

function hasExerciseAiInfo(info: ExerciseAiInfo | undefined): info is ExerciseAiInfo {
  return !!(
    info &&
    Array.isArray(info.targetMuscles) &&
    info.targetMuscles.length > 0 &&
    typeof info.executionGuide === "string" &&
    info.executionGuide.trim() &&
    Array.isArray(info.coachingTips) &&
    info.coachingTips.length > 0
  );
}

export function WorkoutEditorPage({ mode }: WorkoutEditorPageProps) {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnitLabel, language } = useSettings();
  const [draft, setDraft] = useState<WorkoutDraft>(createEmptyDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [collapsedExercises, setCollapsedExercises] = useState<Record<number, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isAddExerciseExpanded, setIsAddExerciseExpanded] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [deleteExerciseIndex, setDeleteExerciseIndex] = useState<number | null>(null);
  const [isGeneratingExerciseInfo, setIsGeneratingExerciseInfo] = useState(false);
  const [isExerciseInfoReloadDialogOpen, setIsExerciseInfoReloadDialogOpen] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !workoutId) {
      return;
    }

    void (async () => {
      const numericId = Number(workoutId);
      if (Number.isNaN(numericId)) {
        navigate("/");
        return;
      }

      const existing = await getWorkoutById(numericId);
      if (!existing) {
        navigate("/");
        return;
      }

      setDraft({
        name: existing.workout.name,
        exercises: existing.exercises.map((item) => ({
          name: item.exercise.name,
          notes: item.exercise.notes ?? "",
          aiInfo: item.exercise.aiInfo,
          x2Enabled: item.exercise.x2Enabled ?? false,
          sets: item.sets.map((set) => ({
            targetReps: set.targetReps,
            targetWeight: set.targetWeight
          }))
        }))
      });
    })();
  }, [mode, workoutId, navigate]);

  const isValid = useMemo(() => {
    if (!draft.name.trim()) {
      return false;
    }

    if (draft.exercises.length === 0) {
      return false;
    }

    return draft.exercises.every(
      (exercise) =>
        exercise.name.trim().length > 0 &&
        exercise.sets.length > 0 &&
        exercise.sets.every((set) => set.targetReps > 0 && set.targetWeight >= 0)
    );
  }, [draft]);

  const namedExerciseCount = useMemo(
    () => draft.exercises.filter((exercise) => exercise.name.trim().length > 0).length,
    [draft.exercises]
  );

  const handleGenerateExerciseInfo = useCallback(async (options: GenerateExerciseInfoOptions = {}) => {
    const forceRefresh = options.forceRefresh === true;
    const baseDraft = structuredClone(draft);

    if (baseDraft.exercises.every((exercise) => !exercise.name.trim())) {
      toast.error(t("exerciseInfoGenerateNoExercises"));
      return;
    }

    if (forceRefresh) {
      for (const exercise of baseDraft.exercises) {
        if (!exercise.name.trim()) {
          continue;
        }
        exercise.aiInfo = undefined;
      }
    }

    const existingInfoByName = new Map<string, ExerciseAiInfo>();
    let locallyFilledCount = 0;
    if (!forceRefresh) {
      for (const exercise of baseDraft.exercises) {
        const key = normalizeExerciseName(exercise.name);
        if (!key || !hasExerciseAiInfo(exercise.aiInfo) || existingInfoByName.has(key)) {
          continue;
        }
        existingInfoByName.set(key, exercise.aiInfo);
      }

      for (const exercise of baseDraft.exercises) {
        if (hasExerciseAiInfo(exercise.aiInfo)) {
          continue;
        }
        const key = normalizeExerciseName(exercise.name);
        if (!key) {
          continue;
        }
        const localInfo = existingInfoByName.get(key);
        if (!localInfo) {
          continue;
        }
        exercise.aiInfo = localInfo;
        locallyFilledCount += 1;
      }
    }

    const missingNames = Array.from(
      new Set(
        baseDraft.exercises
          .filter((exercise) => !hasExerciseAiInfo(exercise.aiInfo))
          .map((exercise) => exercise.name.trim())
          .filter(Boolean)
      )
    );

    if (missingNames.length === 0) {
      if (locallyFilledCount > 0) {
        setDraft(baseDraft);
        toast.success(t("exerciseInfoGenerateSuccess").replace("{count}", String(locallyFilledCount)));
      } else {
        setIsExerciseInfoReloadDialogOpen(true);
      }
      return;
    }

    setIsGeneratingExerciseInfo(true);
    try {
      const response = await fetch("/api/exercise-info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: language,
          exerciseNames: missingNames
        })
      });

      if (!response.ok) {
        let errorCode = "";
        let errorDetail = "";
        try {
          const errorPayload = (await response.json()) as { error?: string; detail?: string };
          errorCode = typeof errorPayload.error === "string" ? errorPayload.error : "";
          errorDetail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
        } catch {
          // ignore parse errors and fall back to generic message
        }

        if (response.status === 404) {
          toast.error(t("exerciseInfoEndpointUnavailable"));
          return;
        }
        if (errorCode.includes("GROQ_API_KEY") || errorDetail.includes("GROQ_API_KEY")) {
          toast.error(t("exerciseInfoProviderNotConfigured"));
          return;
        }

        toast.error(t("exerciseInfoGenerateFailed"));
        return;
      }

      const payload = (await response.json()) as {
        exercises?: unknown;
        sourceProvider?: string;
        sourceModel?: string;
      };
      const items = Array.isArray(payload.exercises) ? payload.exercises.filter(isExerciseInfoApiItem) : [];
      if (items.length === 0) {
        toast.error(t("exerciseInfoGenerateFailed"));
        return;
      }

      const generatedAt = new Date().toISOString();
      const infoByName = new Map<string, ExerciseAiInfo>();
      for (const item of items) {
        const key = normalizeExerciseName(item.inputName);
        if (!key) continue;

        const targetMuscles = item.targetMuscles
          .map((muscle) => ({
            muscle: typeof muscle.muscle === "string" ? muscle.muscle.trim() : "",
            involvementPercent: Math.max(0, Math.min(100, Math.round(Number(muscle.involvementPercent) || 0)))
          }))
          .filter((muscle) => muscle.muscle);
        const coachingTips = item.coachingTips.map((tip) => tip.trim()).filter(Boolean);
        const executionGuide = item.executionGuide.trim();

        if (targetMuscles.length === 0 || coachingTips.length === 0 || !executionGuide) {
          continue;
        }

        infoByName.set(key, {
          targetMuscles,
          coachingTips,
          executionGuide,
          generatedAt,
          sourceProvider: typeof payload.sourceProvider === "string" ? payload.sourceProvider : "groq",
          sourceModel: typeof payload.sourceModel === "string" ? payload.sourceModel : undefined
        });
      }

      let apiUpdatedCount = 0;
      for (const exercise of baseDraft.exercises) {
        if (!forceRefresh && hasExerciseAiInfo(exercise.aiInfo)) {
          continue;
        }
        const info = infoByName.get(normalizeExerciseName(exercise.name));
        if (!info) {
          continue;
        }
        exercise.aiInfo = info;
        apiUpdatedCount += 1;
      }

      const totalUpdatedCount = locallyFilledCount + apiUpdatedCount;
      if (totalUpdatedCount <= 0) {
        toast.error(t("exerciseInfoGenerateFailed"));
        return;
      }

      setDraft(baseDraft);
      toast.success(t("exerciseInfoGenerateSuccess").replace("{count}", String(totalUpdatedCount)));
    } catch {
      toast.error(t("exerciseInfoGenerateFailed"));
    } finally {
      setIsGeneratingExerciseInfo(false);
    }
  }, [draft, language, t]);

  const handleSave = useCallback(async () => {
    if (!isValid) {
      return;
    }

    try {
      setIsSaving(true);
      if (mode === "create") {
        await createWorkout(draft);
        toast.success(t("workoutCreated"));
      } else {
        await updateWorkout(Number(workoutId), draft);
        toast.success(t("workoutUpdated"));
      }
      navigate("/");
    } finally {
      setIsSaving(false);
    }
  }, [draft, isValid, mode, navigate, t, workoutId]);

  const handleDeleteWorkout = async () => {
    if (mode !== "edit" || !workoutId) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteWorkout(Number(workoutId));
      toast.success(t("workoutDeleted"));
      setIsDeleteDialogOpen(false);
      navigate("/");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    const onSaveRequest = () => {
      void handleSave();
    };

    window.addEventListener("gymtracker:save-workout-editor", onSaveRequest);
    return () => {
      window.removeEventListener("gymtracker:save-workout-editor", onSaveRequest);
    };
  }, [mode, handleSave]);

  return (
    <section className="space-y-4">

      <Card>
        <CardContent className="space-y-2 pt-2">
          <label className="text-xs text-muted-foreground">{t("workoutName")}</label>
          <Input
            id="workout-name"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("workoutNamePlaceholder")}
          />
        </CardContent>
      </Card>

      <h2 className="inline-flex items-center gap-2 text-base font-semibold">
        {t("exercises")}
      </h2>

      {draft.exercises.map((exercise, exerciseIndex) => {
        const collapsed = collapsedExercises[exerciseIndex] ?? false;
        const title = exercise.name.trim() || t("exerciseNew");

        return (
          <Card
            key={`exercise-${exerciseIndex}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const rawFromData = event.dataTransfer.getData("text/plain");
              const fromData = rawFromData.length ? Number(rawFromData) : Number.NaN;
              const fromIndex = Number.isNaN(fromData) ? dragIndex : fromData;
              if (fromIndex === null || fromIndex === exerciseIndex || Number.isNaN(fromIndex)) {
                return;
              }

              setDraft((prev) => reorderExercises(prev, fromIndex, exerciseIndex));
              setDragIndex(null);
            }}
          >
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="flex w-full items-start gap-0.5 text-left"
                    onClick={() =>
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exerciseIndex]: !collapsed
                      }))
                    }
                    aria-label={collapsed ? t("expandExercise") : t("collapseExercise")}
                  >
                    <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                    <CardTitle className="min-w-0 flex-1 text-left leading-tight">{title}</CardTitle>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {exercise.x2Enabled && (
                    <span className="rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                      ×2
                    </span>
                  )}
                  <button
                    type="button"
                    draggable={true}
                    onDragStart={(event) => {
                      setDragIndex(exerciseIndex);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(exerciseIndex));
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    aria-label={t("reorderExercise")}
                    className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>

            </CardHeader>

            <div className={`grid transition-all duration-200 ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
              <div className="overflow-hidden">
                <CardContent className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("exerciseName")}</label>
                  <Input
                    value={exercise.name}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((prev) => {
                        const next = structuredClone(prev);
                        next.exercises[exerciseIndex].name = value;
                        return next;
                      });
                    }}
                    placeholder={t("exerciseNamePlaceholder")}
                  />

                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <NotebookPen className="h-3.5 w-3.5" />
                      {t("notes")}
                    </label>
                    <Textarea
                      rows={1}
                      value={exercise.notes ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((prev) => {
                          const next = structuredClone(prev);
                          next.exercises[exerciseIndex].notes = value;
                          return next;
                        });
                      }}
                      placeholder=""
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{t("sets")}</p>
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span>×2</span>
                      <Switch
                        checked={exercise.x2Enabled ?? false}
                        onCheckedChange={(checked) => {
                          setDraft((prev) => {
                            const next = structuredClone(prev);
                            next.exercises[exerciseIndex].x2Enabled = checked;
                            return next;
                          });
                        }}
                        aria-label={t("exerciseX2Toggle")}
                      />
                    </label>
                  </div>
                  {exercise.sets.map((set, setIndex) => (
                    <div key={`set-${setIndex}`} className="grid grid-cols-[1fr_1fr] items-center gap-2 py-1">
                      <div className="min-w-0">
                        <div className="relative">
                          <DecimalInput
                            value={set.targetReps}
                            min={1}
                            step={1}
                            className="pr-10"
                            onCommit={(value) => {
                              setDraft((prev) => {
                                const next = structuredClone(prev);
                                next.exercises[exerciseIndex].sets[setIndex].targetReps = value;
                                return next;
                              });
                            }}
                          />
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                            ×
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="relative">
                          <DecimalInput
                            value={set.targetWeight}
                            min={0}
                            step={0.5}
                            className="pr-12"
                            onCommit={(value) => {
                              setDraft((prev) => {
                                const next = structuredClone(prev);
                                next.exercises[exerciseIndex].sets[setIndex].targetWeight = value;
                                return next;
                              });
                            }}
                          />
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                            {weightUnitLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 border-t pt-2">
                    <ExerciseInfoDialogButton
                      exerciseName={exercise.name.trim() || title}
                      aiInfo={exercise.aiInfo}
                      className="h-8 w-8 rounded-md text-muted-foreground/70"
                    />
                    <div className="flex-1" />
                    <button
                      type="button"
                      disabled={draft.exercises.length <= 1}
                      onClick={() => {
                        const setCount = draft.exercises[exerciseIndex]?.sets.length ?? 0;
                        if (setCount > 1) {
                          setDraft((prev) => {
                            const next = structuredClone(prev);
                            next.exercises[exerciseIndex].sets.pop();
                            return next;
                          });
                          return;
                        }

                        setDeleteExerciseIndex(exerciseIndex);
                      }}
                      aria-label={t("removeExercise")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-md text-lg leading-none"
                      onClick={() => {
                        setDraft((prev) => {
                          const next = structuredClone(prev);
                          next.exercises[exerciseIndex].sets.push({
                            targetReps: 10,
                            targetWeight: 0
                          });
                          return next;
                        });
                      }}
                      aria-label={t("addSet")}
                    >
                      +
                    </Button>
                  </div>
                </CardContent>
              </div>
            </div>
          </Card>
        );
      })}

      {!isAddExerciseExpanded && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setIsAddExerciseExpanded(true)}
            aria-label={t("addExercise")}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addExercise")}
          </Button>
        </div>
      )}

      {isAddExerciseExpanded && (
        <Card className="relative">
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label={t("cancel")}
            onClick={() => {
              setNewExerciseName("");
              setIsAddExerciseExpanded(false);
            }}
          >
            <X className="h-3 w-3" />
          </button>
          <CardContent className="space-y-2 pt-2">
            <label className="text-xs text-muted-foreground">{t("exerciseName")}</label>
            <div className="flex items-center gap-2">
              <Input
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                placeholder={t("exerciseNamePlaceholder")}
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-md text-lg leading-none"
                onClick={() => {
                  const trimmed = newExerciseName.trim();
                  if (!trimmed) {
                    return;
                  }

                  setDraft((prev) => ({
                    ...prev,
                    exercises: [
                      ...prev.exercises,
                      {
                        name: trimmed,
                        notes: "",
                        x2Enabled: false,
                        sets: [
                          { targetReps: 10, targetWeight: 0 },
                          { targetReps: 10, targetWeight: 0 },
                          { targetReps: 10, targetWeight: 0 }
                        ]
                      }
                    ]
                  }));
                  setNewExerciseName("");
                  setIsAddExerciseExpanded(false);
                }}
              >
                +
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="h-px bg-border" />

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("exerciseInfoGenerateSectionTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("exerciseInfoGenerateSectionDescription")}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full gap-1.5"
            disabled={isGeneratingExerciseInfo || namedExerciseCount === 0}
            onClick={() => void handleGenerateExerciseInfo()}
          >
            {isGeneratingExerciseInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGeneratingExerciseInfo ? t("exerciseInfoGenerating") : t("exerciseInfoGenerate")}
          </Button>
        </CardContent>
      </Card>

      <div className="h-px bg-border" />

      <div className="space-y-2">
        <Button className="w-full" disabled={!isValid || isSaving || isDeleting} onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          {t("save")}
        </Button>
        {mode === "edit" && (
          <Button
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={isSaving || isDeleting}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("deleteWorkout")}
          </Button>
        )}
      </div>

      <Dialog open={deleteExerciseIndex !== null} onOpenChange={(open) => !open && setDeleteExerciseIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeExercise")}</DialogTitle>
            <DialogDescription>{t("deleteExerciseConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExerciseIndex(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={() => {
                if (deleteExerciseIndex === null) {
                  return;
                }

                setDraft((prev) => {
                  if (prev.exercises.length <= 1 || deleteExerciseIndex >= prev.exercises.length) {
                    return prev;
                  }
                  const next = structuredClone(prev);
                  next.exercises.splice(deleteExerciseIndex, 1);
                  return next;
                });
                setDeleteExerciseIndex(null);
              }}
            >
              {t("removeExercise")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExerciseInfoReloadDialogOpen} onOpenChange={setIsExerciseInfoReloadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("exerciseInfoReloadConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("exerciseInfoReloadConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsExerciseInfoReloadDialogOpen(false)}
              disabled={isGeneratingExerciseInfo}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                setIsExerciseInfoReloadDialogOpen(false);
                void handleGenerateExerciseInfo({ forceRefresh: true });
              }}
              disabled={isGeneratingExerciseInfo}
            >
              {t("exerciseInfoReloadConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteWorkout")}</DialogTitle>
            <DialogDescription>{t("deleteWorkoutConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={handleDeleteWorkout}
              disabled={isDeleting}
            >
              {t("deleteWorkout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
