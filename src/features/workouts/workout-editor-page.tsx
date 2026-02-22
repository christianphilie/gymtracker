import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, GripVertical, NotebookPen, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DecimalInput } from "@/components/forms/decimal-input";
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
import {
  createWorkout,
  deleteWorkout,
  getWorkoutById,
  updateWorkout,
  type WorkoutDraft
} from "@/db/repository";
import { useSettings } from "@/app/settings-context";

interface WorkoutEditorPageProps {
  mode: "create" | "edit";
}

function createEmptyDraft(): WorkoutDraft {
  return {
    name: "",
    exercises: [
      {
        name: "",
        notes: "",
        sets: [{ targetReps: 10, targetWeight: 0 }]
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

function exerciseSearchUrl(name: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} exercise database`)}`;
}

export function WorkoutEditorPage({ mode }: WorkoutEditorPageProps) {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnit } = useSettings();
  const [draft, setDraft] = useState<WorkoutDraft>(createEmptyDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [collapsedExercises, setCollapsedExercises] = useState<Record<number, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isAddExerciseExpanded, setIsAddExerciseExpanded] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");

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

  const handleSave = async () => {
    if (!isValid) {
      return;
    }

    try {
      setIsSaving(true);
      if (mode === "create") {
        const newWorkoutId = await createWorkout(draft);
        navigate(`/workouts/${newWorkoutId}/edit`);
        toast.success(t("workoutCreated"));
      } else {
        await updateWorkout(Number(workoutId), draft);
        toast.success(t("workoutUpdated"));
      }
    } finally {
      setIsSaving(false);
    }
  };

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

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? t("newWorkout") : t("editWorkoutTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="text-xs text-muted-foreground">{t("workoutName")}</label>
          <Input
            id="workout-name"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("workoutName")}
          />
        </CardContent>
      </Card>

      {draft.exercises.map((exercise, exerciseIndex) => {
        const collapsed = collapsedExercises[exerciseIndex] ?? false;
        const title = exercise.name.trim() || t("exerciseSingular");

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
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exerciseIndex]: !collapsed
                      }))
                    }
                    aria-label={collapsed ? t("expandExercise") : t("collapseExercise")}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                  </button>
                  <CardTitle>{title}</CardTitle>
                  <a
                    href={exerciseSearchUrl(title)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] text-muted-foreground hover:text-foreground"
                    aria-label={t("exerciseHelp")}
                  >
                    ?
                  </a>
                </div>

                <div className="flex items-center gap-1">
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

              {!collapsed && (
                <>
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
                    placeholder="Bench Press"
                  />

                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <NotebookPen className="h-3.5 w-3.5" />
                      {t("notes")}
                    </label>
                    <Textarea
                      value={exercise.notes ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((prev) => {
                          const next = structuredClone(prev);
                          next.exercises[exerciseIndex].notes = value;
                          return next;
                        });
                      }}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}
            </CardHeader>

            {!collapsed && (
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("sets")}</p>
                {exercise.sets.map((set, setIndex) => (
                  <div key={`set-${setIndex}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 py-1">
                    <div className="min-w-0">
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
                      <div className="pointer-events-none -mt-7 mr-2 flex justify-end text-base text-muted-foreground">
                        ×
                      </div>
                    </div>

                    <div className="min-w-0">
                      <DecimalInput
                        value={set.targetWeight}
                        min={0}
                        step={0.5}
                        className="pr-10"
                        onCommit={(value) => {
                          setDraft((prev) => {
                            const next = structuredClone(prev);
                            next.exercises[exerciseIndex].sets[setIndex].targetWeight = value;
                            return next;
                          });
                        }}
                      />
                      <div className="pointer-events-none -mt-7 mr-2 flex justify-end text-base text-muted-foreground">
                        {weightUnit}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-md"
                        disabled={exercise.sets.length <= 1}
                        onClick={() => {
                          setDraft((prev) => {
                            const next = structuredClone(prev);
                            next.exercises[exerciseIndex].sets.splice(setIndex, 1);
                            return next;
                          });
                        }}
                        aria-label={t("remove")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between">
                  <button
                    type="button"
                    disabled={draft.exercises.length <= 1}
                    onClick={() => {
                      setDraft((prev) => {
                        const next = structuredClone(prev);
                        next.exercises.splice(exerciseIndex, 1);
                        return next;
                      });
                    }}
                    aria-label={t("removeExercise")}
                    className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/70 hover:text-foreground disabled:opacity-40"
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
            )}
          </Card>
        );
      })}

      <Card>
        <CardContent className="space-y-2 pt-4">
          {!isAddExerciseExpanded && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddExerciseExpanded(true)}
                aria-label={t("addExercise")}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("addExercise")}
              </Button>
            </div>
          )}

          {isAddExerciseExpanded && (
            <div className="flex items-center gap-2">
              <Input
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                placeholder={t("exerciseName")}
              />
              <Button
                variant="outline"
                size="icon"
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
                        sets: [{ targetReps: 10, targetWeight: 0 }]
                      }
                    ]
                  }));
                  setNewExerciseName("");
                  setIsAddExerciseExpanded(false);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setNewExerciseName("");
                  setIsAddExerciseExpanded(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2 rounded-lg border bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <Button className="w-full" disabled={!isValid || isSaving || isDeleting} onClick={handleSave}>
          {t("save")}
        </Button>
        {mode === "edit" && (
          <Button
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={isSaving || isDeleting}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            {t("deleteWorkout")}
          </Button>
        )}
      </div>

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
