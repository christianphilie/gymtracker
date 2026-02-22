import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, History, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDateTime, formatNumber } from "@/lib/utils";

interface EditableSessionSet {
  id: number;
  sessionExerciseKey: string;
  exerciseName: string;
  exerciseOrder: number;
  templateSetOrder: number;
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

export function WorkoutHistoryPage() {
  const { workoutId } = useParams();
  const { t, weightUnit } = useSettings();
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

  const groupedHistory = useMemo(() => {
    return (payload?.history ?? []).map((entry) => {
      const grouped = new Map<string, typeof entry.sets>();
      for (const set of entry.sets) {
        const list = grouped.get(set.sessionExerciseKey) ?? [];
        list.push(set);
        grouped.set(set.sessionExerciseKey, list);
      }

      const exercises = [...grouped.values()]
        .map((sets) => sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
        .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);

      const completedSets = entry.sets.filter((set) => set.completed);
      const setsForExerciseCount = completedSets.length > 0 ? completedSets : entry.sets;
      const exerciseCount = new Set(setsForExerciseCount.map((set) => set.sessionExerciseKey)).size;
      const setCount = completedSets.length;
      const repsTotal = completedSets.reduce((sum, set) => sum + (set.actualReps ?? set.targetReps), 0);
      const totalWeight = completedSets.reduce(
        (sum, set) => sum + (set.actualWeight ?? set.targetWeight) * (set.actualReps ?? set.targetReps),
        0
      );

      return {
        ...entry,
        exercises,
        stats: {
          exerciseCount,
          setCount,
          repsTotal,
          totalWeight
        }
      };
    });
  }, [payload?.history]);

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
        if (a.exerciseOrder !== b.exerciseOrder) {
          return a.exerciseOrder - b.exerciseOrder;
        }
        return a.templateSetOrder - b.templateSetOrder;
      })
      .map((set) => ({
        id: set.id,
        sessionExerciseKey: set.sessionExerciseKey,
        exerciseName: set.exerciseName,
        exerciseOrder: set.exerciseOrder,
        templateSetOrder: set.templateSetOrder,
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
    if (!editingSessionId) {
      return;
    }

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
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("workouts")}
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-base font-semibold">{payload.workout.workout.name}</h1>
          <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            {t("sessionHistory")}
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
        <Card key={entry.session.id}>
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm">{formatDateTime(entry.session.finishedAt ?? entry.session.startedAt)}</CardTitle>
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
                  <p className="text-xs font-medium">{firstSet.exerciseName}</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {sets.map((set, index) => {
                      return (
                        <p key={set.id ?? `${firstSet.sessionExerciseKey}-${index}`}>
                          #{index + 1}: {set.actualReps ?? set.targetReps} × {set.actualWeight ?? set.targetWeight} {weightUnit}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-4">
              <p>
                {t("exercises")}: <span className="text-foreground">{entry.stats.exerciseCount}</span>
              </p>
              <p>
                {t("sets")}: <span className="text-foreground">{entry.stats.setCount}</span>
              </p>
              <p>
                {t("repsTotal")}: <span className="text-foreground">{entry.stats.repsTotal}</span>
              </p>
              <p>
                {t("totalWeight")}: <span className="text-foreground">{formatNumber(entry.stats.totalWeight, 1)} {weightUnit}</span>
              </p>
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
                    <CardTitle>{firstSet.exerciseName}</CardTitle>
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
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                            ×
                          </span>
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
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                            {weightUnit}
                          </span>
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
            <Button variant="outline" onClick={() => setEditingSessionId(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={isSavingEdit} onClick={() => void handleSaveSessionEdit()}>
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
            <Button variant="outline" onClick={() => setDeleteSessionId(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={async () => {
                if (!deleteSessionId) {
                  return;
                }
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
