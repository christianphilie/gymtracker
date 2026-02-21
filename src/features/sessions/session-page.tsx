import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Flag, NotebookPen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
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
import { Label } from "@/components/ui/label";
import type { SessionExerciseSet } from "@/db/types";
import {
  addSessionExercise,
  addSessionSet,
  completeSession,
  discardSession,
  formatWeightLabel,
  getPreviousSessionSummary,
  getSessionById,
  updateSessionSet
} from "@/db/repository";
import { formatDateTime } from "@/lib/utils";

export function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnit } = useSettings();
  const numericSessionId = Number(sessionId);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);

  const payload = useLiveQuery(async () => {
    if (Number.isNaN(numericSessionId)) {
      return null;
    }

    const sessionPayload = await getSessionById(numericSessionId);
    if (!sessionPayload) {
      return null;
    }

    const previousSummary = await getPreviousSessionSummary(
      sessionPayload.session.workoutId,
      sessionPayload.session.id!
    );

    return {
      ...sessionPayload,
      previousSummary
    };
  }, [numericSessionId]);

  const groupedSets = useMemo(() => {
    const map = new Map<string, SessionExerciseSet[]>();

    for (const set of payload?.sets ?? []) {
      const current = map.get(set.sessionExerciseKey) ?? [];
      current.push(set);
      map.set(set.sessionExerciseKey, current);
    }

    for (const [key, sets] of map.entries()) {
      map.set(
        key,
        sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder)
      );
    }

    return map;
  }, [payload?.sets]);

  const sessionExercises = useMemo(() => {
    return [...groupedSets.entries()]
      .map(([sessionExerciseKey, sets]) => {
        const firstSet = sets[0];
        return {
          sessionExerciseKey,
          sets,
          exerciseName: firstSet.exerciseName,
          exerciseNotes: firstSet.exerciseNotes,
          exerciseOrder: firstSet.exerciseOrder,
          isTemplateExercise: firstSet.isTemplateExercise,
          templateExerciseId: firstSet.templateExerciseId
        };
      })
      .sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  }, [groupedSets]);

  const templateSetCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const block of payload?.workout.exercises ?? []) {
      if (block.exercise.id) {
        map.set(block.exercise.id, block.sets.length);
      }
    }
    return map;
  }, [payload?.workout.exercises]);

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }

  const isCompleted = payload.session.status === "completed";

  return (
    <section className="space-y-4 pb-6">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>{payload.workout.workout.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("lastSession")}: {payload.previousSummary ? formatDateTime(payload.previousSummary.completedAt) : "-"}
          </p>
          {payload.previousSummary && payload.previousSummary.extraExercises.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("lastSessionExtras")}: {payload.previousSummary.extraExercises.map((item) => `${item.name} (${item.setCount})`).join(", ")}
            </p>
          )}
        </CardHeader>
      </Card>

      {sessionExercises.map((exercise, exerciseIndex) => {
        const lastTemplateSets =
          exercise.templateExerciseId !== undefined
            ? payload.previousSummary?.templateExerciseSets[exercise.templateExerciseId]
            : undefined;

        const templateSetCount =
          exercise.templateExerciseId !== undefined ? (templateSetCounts.get(exercise.templateExerciseId) ?? 0) : 0;
        const extraLastSessionSets = Math.max(0, (lastTemplateSets?.length ?? 0) - templateSetCount);

        return (
          <Card key={exercise.sessionExerciseKey}>
            <CardHeader className="space-y-2">
              <CardTitle>
                {exerciseIndex + 1}. {exercise.exerciseName}
              </CardTitle>
              {exercise.exerciseNotes && (
                <p className="inline-flex items-start gap-1 text-xs text-muted-foreground">
                  <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{exercise.exerciseNotes}</span>
                </p>
              )}
              {lastTemplateSets && (
                <p className="text-xs text-muted-foreground">
                  {t("lastSession")}: {lastTemplateSets.length} {t("sets")}
                  {extraLastSessionSets > 0 ? ` (${extraLastSessionSets} ${t("extraSets")})` : ""}
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-2">
              {exercise.sets.map((set, setIndex) => {
                const lastSet = lastTemplateSets?.[setIndex];
                const actualRepsValue = set.actualReps ?? set.targetReps;
                const actualWeightValue = set.actualWeight ?? set.targetWeight;

                return (
                  <div key={set.id} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                    <div className="col-span-12 text-xs text-muted-foreground">
                      #{setIndex + 1} Soll: {set.targetReps} × {formatWeightLabel(set.targetWeight, weightUnit)}
                      {lastSet &&
                        ` | ${t("lastSession")}: ${(lastSet.actualReps ?? lastSet.targetReps) ?? "-"} × ${formatWeightLabel(
                          lastSet.actualWeight ?? lastSet.targetWeight,
                          weightUnit
                        )}`}
                    </div>

                    <div className="col-span-5">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          value={actualRepsValue}
                          disabled={isCompleted}
                          onChange={(event) => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isNaN(value)) {
                              return;
                            }
                            void updateSessionSet(set.id!, {
                              actualReps: value
                            });
                          }}
                        />
                        <span className="w-4 text-center text-xs text-muted-foreground">×</span>
                      </div>
                    </div>

                    <div className="col-span-5">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={actualWeightValue}
                          disabled={isCompleted}
                          onChange={(event) => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isNaN(value)) {
                              return;
                            }
                            void updateSessionSet(set.id!, {
                              actualWeight: value
                            });
                          }}
                        />
                        <span className="w-6 text-center text-xs text-muted-foreground">{weightUnit}</span>
                      </div>
                    </div>

                    <div className="col-span-2 flex items-end justify-end">
                      <Button
                        variant={set.completed ? "default" : "outline"}
                        size="icon"
                        disabled={isCompleted}
                        onClick={() => {
                          void updateSessionSet(set.id!, {
                            completed: !set.completed
                          });
                        }}
                        aria-label={t("done")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {!isCompleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await addSessionSet(numericSessionId, exercise.sessionExerciseKey);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addSet")}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {!isCompleted && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <Label htmlFor="new-session-exercise">{t("addExercise")}</Label>
            <div className="flex gap-2">
              <Input
                id="new-session-exercise"
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                placeholder={t("exerciseName")}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  if (!newExerciseName.trim()) {
                    return;
                  }

                  try {
                    await addSessionExercise(numericSessionId, newExerciseName);
                    setNewExerciseName("");
                  } catch {
                    toast.error("Could not add exercise");
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addExercise")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isCompleted && (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => setIsCompleteDialogOpen(true)}>
            <Flag className="mr-2 h-4 w-4" />
            {t("completeSession")}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              const shouldDiscard = window.confirm(t("discardSessionConfirm"));
              if (!shouldDiscard) {
                return;
              }

              await discardSession(numericSessionId);
              toast.success(t("sessionDiscarded"));
              navigate("/");
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("discardSession")}
          </Button>
        </div>
      )}

      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("completeSession")}</DialogTitle>
            <DialogDescription>{t("completeSessionTemplatePrompt")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await completeSession(numericSessionId, false);
                toast.success(t("sessionCompleted"));
                navigate("/");
              }}
            >
              {t("completeWithoutTemplate")}
            </Button>
            <Button
              onClick={async () => {
                await completeSession(numericSessionId, true);
                toast.success(t("sessionCompleted"));
                navigate("/");
              }}
            >
              {t("completeWithTemplate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
