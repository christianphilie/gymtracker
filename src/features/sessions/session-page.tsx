import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronDown, Flag, NotebookPen, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
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
import type { SessionExerciseSet } from "@/db/types";
import {
  addSessionExercise,
  addSessionSet,
  completeSession,
  discardSession,
  getPreviousSessionSummary,
  getSessionById,
  removeSessionExercise,
  removeSessionSet,
  updateSessionSet
} from "@/db/repository";
import { formatDateTime } from "@/lib/utils";

function ExerciseSearchLink({ exerciseName }: { exerciseName: string }) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(`${exerciseName} exercise database`)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] text-muted-foreground hover:text-foreground"
      aria-label="Exercise links"
    >
      ?
    </a>
  );
}

function formatInlineValue(value: number) {
  return `${value}`;
}

export function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnitLabel } = useSettings();
  const numericSessionId = Number(sessionId);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [isAddExerciseExpanded, setIsAddExerciseExpanded] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [collapsedExercises, setCollapsedExercises] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    const onCompleteRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId?: number }>;
      if (customEvent.detail?.sessionId === numericSessionId) {
        setIsCompleteDialogOpen(true);
      }
    };

    window.addEventListener("gymtracker:complete-session", onCompleteRequest as EventListener);
    return () => {
      window.removeEventListener("gymtracker:complete-session", onCompleteRequest as EventListener);
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
      <div className="space-y-1">
        <h1 className="inline-flex items-center gap-2 text-base font-semibold">
          <Play className="h-4 w-4" />
          {payload.workout.workout.name}
        </h1>
        {!isCompleted && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {t("activeSession")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("since")} {formatDateTime(payload.session.startedAt)}
            </span>
          </div>
        )}
        {payload.previousSummary && payload.previousSummary.extraExercises.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("lastSessionExtras")}:{" "}
            {payload.previousSummary.extraExercises.map((item) => `${item.name} (${item.setCount})`).join(", ")}
          </p>
        )}
      </div>

      {sessionExercises.map((exercise) => {
        const isCollapsed = collapsedExercises[exercise.sessionExerciseKey] ?? false;
        const lastTemplateSets =
          exercise.templateExerciseId !== undefined
            ? payload.previousSummary?.templateExerciseSets[exercise.templateExerciseId]
            : undefined;
        const templateSetCount =
          exercise.templateExerciseId !== undefined ? (templateSetCounts.get(exercise.templateExerciseId) ?? 0) : 0;
        const extraLastSessionSets = (lastTemplateSets ?? []).filter(
          (lastSet) => lastSet.templateSetOrder >= templateSetCount
        ).length;

        return (
          <Card key={exercise.sessionExerciseKey}>
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={isCollapsed ? t("expandExercise") : t("collapseExercise")}
                    onClick={() =>
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exercise.sessionExerciseKey]: !isCollapsed
                      }))
                    }
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>
                  <CardTitle>{exercise.exerciseName}</CardTitle>
                  <ExerciseSearchLink exerciseName={exercise.exerciseName} />
                </div>
              </div>

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

            {!isCollapsed && (
              <CardContent className="space-y-2">
                {exercise.sets.map((set) => {
                  const actualRepsValue = set.actualReps ?? set.targetReps;
                  const actualWeightValue = set.actualWeight ?? set.targetWeight;
                  const showTargetRepsHint = actualRepsValue !== set.targetReps;
                  const showTargetWeightHint = actualWeightValue !== set.targetWeight;

                  return (
                    <div key={set.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 py-1">
                      <div className="min-w-0">
                        <div className="relative">
                          <DecimalInput
                            value={actualRepsValue}
                            min={0}
                            step={1}
                            disabled={isCompleted}
                            className="pr-14"
                            onCommit={async (value) => {
                              if (value === 0 && !isCompleted) {
                                await removeSessionSet(set.id!);
                                return;
                              }
                              void updateSessionSet(set.id!, {
                                actualReps: value
                              });
                            }}
                          />
                          <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground">
                            {showTargetRepsHint && <span className="line-through">{formatInlineValue(set.targetReps)}</span>}
                            <span>×</span>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="relative">
                          <DecimalInput
                            value={actualWeightValue}
                            min={0}
                            step={0.5}
                            disabled={isCompleted}
                            className="pr-16"
                            onCommit={(value) => {
                              void updateSessionSet(set.id!, {
                                actualWeight: value
                              });
                            }}
                          />
                          <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground">
                            {showTargetWeightHint && <span className="line-through">{formatInlineValue(set.targetWeight)}</span>}
                            <span>{weightUnitLabel}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <Button
                          variant={set.completed ? "default" : "outline"}
                          size="icon"
                          className="rounded-md"
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
                  <div className="flex justify-between">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/70 hover:text-foreground"
                      aria-label={t("removeExercise")}
                      onClick={async () => {
                        await removeSessionExercise(numericSessionId, exercise.sessionExerciseKey);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-md text-lg leading-none"
                      onClick={async () => {
                        await addSessionSet(numericSessionId, exercise.sessionExerciseKey);
                      }}
                      aria-label={t("addSet")}
                    >
                      +
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {!isCompleted && (
        <Card className="relative">
          {isAddExerciseExpanded && (
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
          )}
          <CardContent className="space-y-3 pt-4">
            {!isAddExerciseExpanded && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setIsAddExerciseExpanded(true)} aria-label={t("addExercise")}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("addExercise")}
                </Button>
              </div>
            )}

            {isAddExerciseExpanded && (
              <div className="flex items-center gap-2 pr-6">
                <Input
                  id="new-session-exercise"
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                  placeholder={t("exerciseName")}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!newExerciseName.trim()) {
                      return;
                    }

                    try {
                      await addSessionExercise(numericSessionId, newExerciseName);
                      setNewExerciseName("");
                      setIsAddExerciseExpanded(false);
                    } catch {
                      toast.error("Could not add exercise");
                    }
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("addExercise")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isCompleted && (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => setIsCompleteDialogOpen(true)}>
            <Flag className="mr-2 h-4 w-4" />
            {t("completeSession")}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setIsDiscardDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("discardSession")}
          </Button>
        </div>
      )}

      <Dialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discardSession")}</DialogTitle>
            <DialogDescription>{t("discardSessionConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDiscardDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={async () => {
                await discardSession(numericSessionId);
                setIsDiscardDialogOpen(false);
                toast.success(t("sessionDiscarded"));
                navigate("/");
              }}
            >
              {t("discardSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              className="sm:min-w-[230px]"
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
