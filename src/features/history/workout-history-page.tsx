import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteCompletedSession,
  getWorkoutById,
  getWorkoutSessionHistory,
  updateCompletedSessionSets,
  type WorkoutSessionHistoryItem
} from "@/db/repository";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { db } from "@/db/db";
import type { ExerciseAiInfo } from "@/db/types";
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import { formatNumber, formatSessionDateLabel, getSetStatsMultiplier } from "@/lib/utils";

interface EditableSessionSet {
  id?: number;
  templateExerciseId?: number;
  sessionExerciseKey: string;
  exerciseName: string;
  exerciseNotes?: string;
  exerciseAiInfo?: ExerciseAiInfo;
  exerciseOrder: number;
  isTemplateExercise: boolean;
  templateSetOrder: number;
  x2Enabled: boolean;
  actualReps: number;
  actualWeight: number;
  completed: boolean;
}

function getWeekStart(date: Date) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + diff);
  return target;
}

function formatSessionDayOnly(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (dayDiff < 0) {
    return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  if (dayDiff === 0) return language === "de" ? "Heute" : "Today";
  if (dayDiff === 1) return language === "de" ? "Gestern" : "Yesterday";
  if (dayDiff === 2) return language === "de" ? "Vorgestern" : "Day before yesterday";
  if (dayDiff < 14) return language === "de" ? `Vor ${dayDiff} Tagen` : `${dayDiff} days ago`;

  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatClock(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalValue(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatHistoryDurationLabel(durationMinutes: number, language: "de" | "en") {
  const roundedMinutes = Math.max(0, Math.round(durationMinutes));
  if (roundedMinutes < 60) {
    return language === "de" ? `${roundedMinutes} Minuten` : `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return language === "de"
    ? `${hours}:${String(minutes).padStart(2, "0")} Stunden`
    : `${hours}:${String(minutes).padStart(2, "0")} h`;
}

export function WorkoutHistoryPage() {
  const { workoutId } = useParams();
  const { t, weightUnit, language } = useSettings();
  const numericWorkoutId = Number(workoutId);
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingSets, setEditingSets] = useState<EditableSessionSet[]>([]);
  const [editingSessionStartedAtDraft, setEditingSessionStartedAtDraft] = useState("");
  const [editingSessionFinishedAtDraft, setEditingSessionFinishedAtDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const nextEditingDraftSetIdRef = useRef(-1);

  const payload = useLiveQuery(async () => {
    if (Number.isNaN(numericWorkoutId)) {
      return null;
    }

    const [workout, history] = await Promise.all([
      getWorkoutById(numericWorkoutId),
      getWorkoutSessionHistory(numericWorkoutId)
    ]);

    return { workout, history };
  }, [numericWorkoutId]);
  const settings = useLiveQuery(async () => db.settings.get(1), []);
  const templateExerciseInfoMap = useLiveQuery(async () => {
    const templateIds = Array.from(
      new Set(
        (payload?.history ?? [])
          .flatMap((entry) => entry.sets)
          .map((set) => set.templateExerciseId)
          .filter((id): id is number => id !== undefined)
      )
    );
    if (templateIds.length === 0) {
      return new Map<number, ExerciseAiInfo>();
    }
    const exercises = await db.exercises.where("id").anyOf(templateIds).toArray();
    return new Map(
      exercises
        .filter((exercise): exercise is typeof exercise & { id: number } => exercise.id !== undefined && !!exercise.aiInfo)
        .map((exercise) => [exercise.id, exercise.aiInfo!])
    );
  }, [payload?.history]);

  const groupedHistory = useMemo(() => {
    return (payload?.history ?? []).map((entry) => {
      const completedSets = entry.sets.filter((set) => set.completed);
      const grouped = new Map<string, typeof entry.sets>();
      for (const set of completedSets) {
        const list = grouped.get(set.sessionExerciseKey) ?? [];
        list.push(set);
        grouped.set(set.sessionExerciseKey, list);
      }

      const exercises = [...grouped.values()]
        .map((sets) => sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
        .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);

      const setsForExerciseCount = completedSets.length > 0 ? completedSets : entry.sets;
      const exerciseCount = new Set(setsForExerciseCount.map((set) => set.sessionExerciseKey)).size;
      const setCount = completedSets.reduce((sum, set) => sum + getSetStatsMultiplier(set), 0);
      const repsTotal = completedSets.reduce(
        (sum, set) => sum + (set.actualReps ?? set.targetReps) * getSetStatsMultiplier(set),
        0
      );
      const totalWeight = completedSets.reduce(
        (sum, set) =>
          sum +
          (set.actualWeight ?? set.targetWeight) *
            (set.actualReps ?? set.targetReps) *
            getSetStatsMultiplier(set),
        0
      );
      const durationMinutes = getSessionDurationMinutes(entry.session.startedAt, entry.session.finishedAt);
      const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);
      const calories = estimateStrengthTrainingCalories({
        durationMinutes,
        bodyWeightKg,
        completedSetCount: setCount,
        repsTotal
      });

      return {
        ...entry,
        exercises,
        stats: {
          exerciseCount,
          setCount,
          repsTotal,
          totalWeight,
          calories,
          durationMinutes,
          usesDefaultBodyWeightForCalories: usesDefaultBodyWeight
        }
      };
    });
  }, [payload?.history, settings?.bodyWeight, weightUnit]);

  const completedThisWeek = useMemo(() => {
    const weekStart = getWeekStart(new Date());
    return (payload?.history ?? []).filter((entry) => {
      const date = new Date(entry.session.finishedAt ?? entry.session.startedAt);
      return date >= weekStart;
    }).length;
  }, [payload?.history]);

  const closeEditDialog = () => {
    setEditingSessionId(null);
    setEditingSets([]);
    setEditingSessionStartedAtDraft("");
    setEditingSessionFinishedAtDraft("");
    nextEditingDraftSetIdRef.current = -1;
  };

  const startEditSession = (entry: WorkoutSessionHistoryItem) => {
    nextEditingDraftSetIdRef.current = -1;

    const editable = entry.sets
      .filter((set): set is typeof set & { id: number } => set.id !== undefined)
      .sort((a, b) => {
        if (a.exerciseOrder !== b.exerciseOrder) return a.exerciseOrder - b.exerciseOrder;
        return a.templateSetOrder - b.templateSetOrder;
      })
      .map((set) => ({
        id: set.id,
        templateExerciseId: set.templateExerciseId,
        sessionExerciseKey: set.sessionExerciseKey,
        exerciseName: set.exerciseName,
        exerciseNotes: set.exerciseNotes,
        exerciseAiInfo:
          set.exerciseAiInfo ??
          (set.templateExerciseId !== undefined ? templateExerciseInfoMap?.get(set.templateExerciseId) : undefined),
        exerciseOrder: set.exerciseOrder,
        isTemplateExercise: set.isTemplateExercise,
        templateSetOrder: set.templateSetOrder,
        x2Enabled: set.x2Enabled ?? false,
        actualReps: set.actualReps ?? set.targetReps,
        actualWeight: set.actualWeight ?? set.targetWeight,
        completed: set.completed
      }));

    setEditingSessionId(entry.session.id);
    setEditingSets(editable);
    setEditingSessionStartedAtDraft(toDateTimeLocalValue(entry.session.startedAt));
    setEditingSessionFinishedAtDraft(toDateTimeLocalValue(entry.session.finishedAt ?? entry.session.startedAt));
  };

  const groupedEditingSets = useMemo(() => {
    const grouped = new Map<string, EditableSessionSet[]>();
    for (const set of editingSets) {
      const current = grouped.get(set.sessionExerciseKey) ?? [];
      current.push(set);
      grouped.set(set.sessionExerciseKey, current);
    }

    return [...grouped.values()]
      .map((sets) => sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
      .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);
  }, [editingSets]);

  const addEditingSet = (sessionExerciseKey: string) => {
    setEditingSets((prev) => {
      const exerciseSets = prev
        .filter((set) => set.sessionExerciseKey === sessionExerciseKey)
        .sort((a, b) => a.templateSetOrder - b.templateSetOrder);
      const lastSet = exerciseSets[exerciseSets.length - 1];
      if (!lastSet) {
        return prev;
      }

      const nextTemplateSetOrder = lastSet.templateSetOrder + 1;
      const nextDraftSetId = nextEditingDraftSetIdRef.current;
      nextEditingDraftSetIdRef.current -= 1;

      return [
        ...prev,
        {
          ...lastSet,
          id: nextDraftSetId,
          templateSetOrder: nextTemplateSetOrder,
          actualReps: lastSet.actualReps,
          actualWeight: lastSet.actualWeight,
          completed: false
        }
      ];
    });
  };

  const removeLastEditingSet = (sessionExerciseKey: string) => {
    setEditingSets((prev) => {
      const exerciseSets = prev
        .filter((set) => set.sessionExerciseKey === sessionExerciseKey)
        .sort((a, b) => a.templateSetOrder - b.templateSetOrder);
      const lastSet = exerciseSets[exerciseSets.length - 1];
      if (!lastSet) {
        return prev;
      }

      if (exerciseSets.length <= 1) {
        return prev.filter((set) => set.sessionExerciseKey !== sessionExerciseKey);
      }

      return prev.filter((set) => set.id !== lastSet.id);
    });
  };

  const handleSaveSessionEdit = async () => {
    if (!editingSessionId) return;

    const startedAt = fromDateTimeLocalValue(editingSessionStartedAtDraft);
    const finishedAt = fromDateTimeLocalValue(editingSessionFinishedAtDraft);
    if (!startedAt || !finishedAt || new Date(finishedAt).getTime() < new Date(startedAt).getTime()) {
      toast.error(t("sessionTimeRangeInvalid"));
      return;
    }

    setIsSavingEdit(true);
    try {
      const normalizedEditingSets = groupedEditingSets.flatMap((sets, exerciseIndex) =>
        [...sets]
          .sort((a, b) => a.templateSetOrder - b.templateSetOrder)
          .map((set, templateSetOrder) => ({
            ...set,
            exerciseOrder: exerciseIndex,
            templateSetOrder
          }))
      );

      await updateCompletedSessionSets(
        editingSessionId,
        normalizedEditingSets.map((set) => ({
          id: set.id,
          templateExerciseId: set.templateExerciseId,
          sessionExerciseKey: set.sessionExerciseKey,
          exerciseName: set.exerciseName,
          exerciseNotes: set.exerciseNotes,
          exerciseAiInfo: set.exerciseAiInfo,
          exerciseOrder: set.exerciseOrder,
          isTemplateExercise: set.isTemplateExercise,
          x2Enabled: set.x2Enabled,
          templateSetOrder: set.templateSetOrder,
          actualReps: set.actualReps,
          actualWeight: set.actualWeight,
          completed: set.completed
        })),
        { startedAt, finishedAt }
      );
      toast.success(t("sessionUpdated"));
      closeEditDialog();
    } catch {
      toast.error("Action failed");
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (!payload?.workout) {
    return <p className="text-sm text-muted-foreground">Workout not found.</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            <WorkoutNameLabel name={payload.workout.workout.name} icon={payload.workout.workout.icon} />
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("completedThisWeek")}: {completedThisWeek}
        </p>
      </div>

      {groupedHistory.length === 0 && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">{t("noSessionHistory")}</CardContent>
        </Card>
      )}

      {groupedHistory.map((entry) => (
        <Card key={entry.session.id} id={`session-${entry.session.id}`} className="scroll-mt-20">
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-sm">
                  {entry.session.finishedAt
                    ? formatSessionDayOnly(entry.session.finishedAt, language)
                    : formatSessionDateLabel(entry.session.startedAt, language)}
                </CardTitle>
                {entry.session.finishedAt && (
                  <p className="text-xs text-muted-foreground">
                    {formatClock(entry.session.startedAt, language)} - {formatClock(entry.session.finishedAt, language)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label={t("editSession")} onClick={() => startEditSession(entry)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("deleteSession")}
                  onClick={() => setDeleteSessionId(entry.session.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {entry.exercises.map((sets) => {
              const firstSet = sets[0];
              return (
                <div key={firstSet.sessionExerciseKey} className="space-y-1">
                  <div className="rounded-md border bg-card px-2 py-1.5">
                    <div className="flex min-w-0 items-start gap-1">
                      <div className="inline-flex min-w-0 items-center gap-1 text-xs font-medium leading-tight">
                        <p className="min-w-0 text-left">{firstSet.exerciseName}</p>
                        <ExerciseInfoDialogButton
                          exerciseName={firstSet.exerciseName}
                          aiInfo={
                            firstSet.exerciseAiInfo ??
                            (firstSet.templateExerciseId !== undefined
                              ? templateExerciseInfoMap?.get(firstSet.templateExerciseId)
                              : undefined)
                          }
                          className="h-[1.25em] w-[1.25em] shrink-0 text-inherit"
                        />
                      </div>
                      {firstSet.x2Enabled && (
                        <span className="rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                          ×2
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      {sets.map((set, index) => (
                        <p
                          key={set.id ?? `${firstSet.sessionExerciseKey}-${index}`}
                          className="text-xs leading-none text-muted-foreground tabular-nums"
                        >
                          {set.actualReps ?? set.targetReps} × {formatNumber(set.actualWeight ?? set.targetWeight, 0)} {weightUnit}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-1.5 border-t pt-2.5 sm:grid-cols-3">
              <div className="rounded-md border bg-card px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{t("exercises")}</p>
                <p className="text-xs font-semibold">{entry.stats.exerciseCount}</p>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{t("sets")}</p>
                <p className="text-xs font-semibold">{entry.stats.setCount}</p>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{t("repsTotal")}</p>
                <p className="text-xs font-semibold">{entry.stats.repsTotal}</p>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{t("totalWeight")}</p>
                <p className="text-xs font-semibold">{formatNumber(entry.stats.totalWeight, 0)} {weightUnit}</p>
              </div>
              <div className="relative rounded-md border bg-card px-2 py-1.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[10px] text-muted-foreground">{t("calories")}</p>
                  {entry.stats.usesDefaultBodyWeightForCalories && (
                    <InfoHint
                      ariaLabel={t("calories")}
                      text={t("caloriesEstimateAverageHint")}
                      className="-mr-1 -mt-0.5 shrink-0"
                    />
                  )}
                </div>
                <p className="text-xs font-semibold">~{formatNumber(entry.stats.calories, 0)} kcal</p>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{t("duration")}</p>
                <p className="text-xs font-semibold">{formatHistoryDurationLabel(entry.stats.durationMinutes, language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={editingSessionId !== null} onOpenChange={(nextOpen) => !nextOpen && closeEditDialog()}>
        <DialogContent hideClose className="max-h-[80vh] overflow-y-auto">
          <DialogHeader className="flex-row items-center justify-between space-y-0 pr-0">
            <DialogTitle>{t("editSession")}</DialogTitle>
            <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={isSavingEdit} onClick={() => void handleSaveSessionEdit()}>
              <Save className="h-3.5 w-3.5" />
              {t("save")}
            </Button>
          </DialogHeader>
          <div className="space-y-3">
            <Card>
              <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="edit-session-started-at">{t("sessionStartedAt")}</Label>
                  <Input
                    id="edit-session-started-at"
                    type="datetime-local"
                    className="block min-w-0 max-w-full text-base sm:text-sm"
                    value={editingSessionStartedAtDraft}
                    onChange={(event) => setEditingSessionStartedAtDraft(event.currentTarget.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="edit-session-finished-at">{t("sessionEndedAt")}</Label>
                  <Input
                    id="edit-session-finished-at"
                    type="datetime-local"
                    className="block min-w-0 max-w-full text-base sm:text-sm"
                    value={editingSessionFinishedAtDraft}
                    onChange={(event) => setEditingSessionFinishedAtDraft(event.currentTarget.value)}
                  />
                </div>
              </CardContent>
            </Card>
            {groupedEditingSets.map((sets) => {
              const firstSet = sets[0];
              return (
                <Card key={firstSet.sessionExerciseKey}>
                  <CardHeader className="pb-2">
                    <div className="flex min-w-0 items-start gap-1">
                      <CardTitle className="inline-flex min-w-0 items-center gap-1 text-left leading-tight">
                        <span className="min-w-0">{firstSet.exerciseName}</span>
                        <ExerciseInfoDialogButton
                          exerciseName={firstSet.exerciseName}
                          aiInfo={firstSet.exerciseAiInfo}
                          className="h-[1.25em] w-[1.25em] shrink-0 text-inherit"
                        />
                      </CardTitle>
                      {firstSet.x2Enabled && (
                        <span className="rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                          ×2
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sets.map((set) => (
                      <div key={set.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                        <div className="relative">
                          <DecimalInput
                            value={set.actualReps}
                            min={0}
                            step={1}
                            className="pr-10"
                            onCommit={(value) => {
                              setEditingSets((prev) =>
                                prev.map((item) => (item.id === set.id ? { ...item, actualReps: value } : item))
                              );
                            }}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">×</span>
                        </div>
                        <div className="relative">
                          <DecimalInput
                            value={set.actualWeight}
                            min={0}
                            step={0.5}
                            className="pr-10"
                            onCommit={(value) => {
                              setEditingSets((prev) =>
                                prev.map((item) => (item.id === set.id ? { ...item, actualWeight: value } : item))
                              );
                            }}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">{weightUnit}</span>
                        </div>
                        <Button
                          variant={set.completed ? "default" : "outline"}
                          size="icon"
                          className="rounded-md"
                          onClick={() => {
                            setEditingSets((prev) =>
                              prev.map((item) => (item.id === set.id ? { ...item, completed: !item.completed } : item))
                            );
                          }}
                          aria-label={t("done")}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-2 border-t pt-2">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                        aria-label={t("removeSet")}
                        onClick={() => removeLastEditingSet(firstSet.sessionExerciseKey)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-md"
                        onClick={() => addEditingSet(firstSet.sessionExerciseKey)}
                        aria-label={t("addSet")}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DialogFooter className="pt-2 sm:pt-3">
            <Button variant="outline" onClick={closeEditDialog}>{t("cancel")}</Button>
            <Button className="gap-1.5" disabled={isSavingEdit} onClick={() => void handleSaveSessionEdit()}>
              <Save className="h-4 w-4" />
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteSessionId !== null} onOpenChange={(nextOpen) => !nextOpen && setDeleteSessionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteSession")}</DialogTitle>
            <DialogDescription>{t("deleteSessionConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSessionId(null)}>{t("cancel")}</Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={async () => {
                if (!deleteSessionId) return;
                try {
                  await deleteCompletedSession(deleteSessionId);
                  toast.success(t("sessionDeleted"));
                  setDeleteSessionId(null);
                } catch {
                  toast.error("Action failed");
                }
              }}
            >
              {t("deleteSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
