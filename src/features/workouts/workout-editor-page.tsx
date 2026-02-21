import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function WorkoutEditorPage({ mode }: WorkoutEditorPageProps) {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const { t } = useSettings();
  const [draft, setDraft] = useState<WorkoutDraft>(createEmptyDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
        toast.success(t("createWorkout"));
      } else {
        await updateWorkout(Number(workoutId), draft);
        toast.success(t("updateWorkout"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorkout = async () => {
    if (mode !== "edit" || !workoutId) {
      return;
    }

    const shouldDelete = window.confirm(t("deleteWorkoutConfirm"));
    if (!shouldDelete) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteWorkout(Number(workoutId));
      toast.success(t("workoutDeleted"));
      navigate("/");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? t("newWorkout") : t("edit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="workout-name">{t("workoutName")}</Label>
          <Input
            id="workout-name"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
        </CardContent>
      </Card>

      {draft.exercises.map((exercise, exerciseIndex) => (
        <Card key={`exercise-${exerciseIndex}`}>
          <CardHeader className="space-y-3">
            <CardTitle>
              {t("exerciseSingular")} #{exerciseIndex + 1}
            </CardTitle>
            <div className="space-y-2">
              <Label>{t("exerciseName")}</Label>
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
            </div>
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1">
                <NotebookPen className="h-3.5 w-3.5" />
                {t("notes")}
              </Label>
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
          </CardHeader>

          <CardContent className="space-y-2">
            {exercise.sets.map((set, setIndex) => (
              <div key={`set-${setIndex}`} className="grid grid-cols-5 gap-2 rounded-md border p-2">
                <div className="col-span-2">
                  <Label className="text-xs">{t("targetReps")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={set.targetReps}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setDraft((prev) => {
                        const next = structuredClone(prev);
                        next.exercises[exerciseIndex].sets[setIndex].targetReps = Number.isNaN(value) ? 0 : value;
                        return next;
                      });
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">{t("targetWeight")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={set.targetWeight}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setDraft((prev) => {
                        const next = structuredClone(prev);
                        next.exercises[exerciseIndex].sets[setIndex].targetWeight = Number.isNaN(value) ? 0 : value;
                        return next;
                      });
                    }}
                  />
                </div>
                <div className="col-span-1 flex items-end">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={exercise.sets.length <= 1}
                    onClick={() => {
                      setDraft((prev) => {
                        const next = structuredClone(prev);
                        next.exercises[exerciseIndex].sets.splice(setIndex, 1);
                        return next;
                      });
                    }}
                  >
                    -
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={() => {
                setDraft((prev) => {
                  const next = structuredClone(prev);
                  next.exercises[exerciseIndex].sets.push({ targetReps: 10, targetWeight: 0 });
                  return next;
                });
              }}
            >
              {t("addSet")}
            </Button>
          </CardContent>

          <CardFooter>
            <Button
              variant="outline"
              disabled={draft.exercises.length <= 1}
              onClick={() => {
                setDraft((prev) => {
                  const next = structuredClone(prev);
                  next.exercises.splice(exerciseIndex, 1);
                  return next;
                });
              }}
            >
              {t("remove")}
            </Button>
          </CardFooter>
        </Card>
      ))}

      <Button
        variant="outline"
        onClick={() => {
          setDraft((prev) => ({
            ...prev,
            exercises: [...prev.exercises, { name: "", notes: "", sets: [{ targetReps: 10, targetWeight: 0 }] }]
          }));
        }}
      >
        {t("addExercise")}
      </Button>

      <div className="sticky bottom-16 space-y-2 rounded-lg border bg-background p-3 sm:bottom-4">
        <Button className="w-full" disabled={!isValid || isSaving || isDeleting} onClick={handleSave}>
          {t("save")}
        </Button>
        {mode === "edit" && (
          <Button
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={isSaving || isDeleting}
            onClick={handleDeleteWorkout}
          >
            {t("deleteWorkout")}
          </Button>
        )}
      </div>
    </section>
  );
}
