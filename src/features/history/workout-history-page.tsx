import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
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
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import { formatNumber, formatSessionDateLabel, getSetStatsMultiplier } from "@/lib/utils";

interface EditableSessionSet {
  id: number;
  sessionExerciseKey: string;
  exerciseName: string;
  exerciseOrder: number;
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

export function WorkoutHistoryPage() {
  const { workoutId } = useParams();
  const { t, weightUnit, language } = useSettings();
  const numericWorkoutId = Number(workoutId);
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingSets, setEditingSets] = useState<EditableSessionSet[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
      const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);
      const calories = estimateStrengthTrainingCalories({
        durationMinutes: getSessionDurationMinutes(entry.session.startedAt, entry.session.finishedAt),
        bodyWeightKg,
          completedSetCount: setCount,
          repsTotal
        });

      return {
        ...entry,
        exercises,
        stats: { exerciseCount, setCount, repsTotal, totalWeight, calories, usesDefaultBodyWeightForCalories: usesDefaultBodyWeight }
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
  const startEditSession = (entry: WorkoutSessionHistoryItem) => {
    const editable = entry.sets
      .filter((set): set is typeof set & { id: number } => set.id !== undefined)
      .sort((a, b) => {
        if (a.exerciseOrder !== b.exerciseOrder) return a.exerciseOrder - b.exerciseOrder;
        return a.templateSetOrder - b.templateSetOrder;
      })
      .map((set) => ({
        id: set.id,
        sessionExerciseKey: set.sessionExerciseKey,
        exerciseName: set.exerciseName,
        exerciseOrder: set.exerciseOrder,
        templateSetOrder: set.templateSetOrder,
        x2Enabled: set.x2Enabled ?? false,
        actualReps: set.actualReps ?? set.targetReps,
        actualWeight: set.actualWeight ?? set.targetWeight,
        completed: set.completed
      }));

    setEditingSessionId(entry.session.id);
    setEditingSets(editable);
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

  const handleSaveSessionEdit = async () => {
    if (!editingSessionId) return;

    setIsSavingEdit(true);
    try {
      await updateCompletedSessionSets(
        editingSessionId,
        editingSets.map((set) => ({
          id: set.id,
          actualReps: set.actualReps,
          actualWeight: set.actualWeight,
          completed: set.completed
        }))
      );
      toast.success(t("sessionUpdated"));
      setEditingSessionId(null);
      setEditingSets([]);
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
          <p className="text-sm font-medium">{payload.workout.workout.name}</p>
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
                      <p className="min-w-0 text-left text-xs font-medium leading-tight">{firstSet.exerciseName}</p>
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
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={editingSessionId !== null} onOpenChange={(nextOpen) => !nextOpen && setEditingSessionId(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editSession")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {groupedEditingSets.map((sets) => {
              const firstSet = sets[0];
              return (
                <Card key={firstSet.sessionExerciseKey}>
                  <CardHeader className="pb-2">
                    <div className="flex min-w-0 items-start gap-1">
                      <CardTitle className="min-w-0 text-left leading-tight">{firstSet.exerciseName}</CardTitle>
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSessionId(null)}>{t("cancel")}</Button>
            <Button disabled={isSavingEdit} onClick={() => void handleSaveSessionEdit()}>{t("save")}</Button>
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
