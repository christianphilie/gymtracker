import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { BookSearch, Check, ChevronDown, Flag, NotebookPen, OctagonX, Play, Plus, Trash2, X } from "lucide-react";
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
import { formatSessionDateLabel } from "@/lib/utils";

const ACTIVE_SESSION_PILL_CLASS = "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700";
const SUCCESS_CIRCLE_CLASS = "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700";
const SESSION_COLLAPSED_STORAGE_KEY_PREFIX = "gymtracker:session-collapsed:";

function ExerciseSearchLink({ exerciseName }: { exerciseName: string }) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(`${exerciseName} exercise database`)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
      aria-label="Exercise links"
    >
      <BookSearch className="h-4 w-4" />
    </a>
  );
}

function formatInlineValue(value: number) {
  return `${value}`;
}

export function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnitLabel, language } = useSettings();
  const numericSessionId = Number(sessionId);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [isAddExerciseExpanded, setIsAddExerciseExpanded] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [collapsedExercises, setCollapsedExercises] = useState<Record<string, boolean>>({});
  const [loadedCollapsedStateSessionId, setLoadedCollapsedStateSessionId] = useState<number | null>(null);
  const [deleteExerciseTarget, setDeleteExerciseTarget] = useState<{ key: string } | null>(null);

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
    if (Number.isNaN(numericSessionId)) {
      return;
    }
    setLoadedCollapsedStateSessionId(null);

    try {
      const raw = window.localStorage.getItem(`${SESSION_COLLAPSED_STORAGE_KEY_PREFIX}${numericSessionId}`);
      if (!raw) {
        setCollapsedExercises({});
        setLoadedCollapsedStateSessionId(numericSessionId);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        setCollapsedExercises(parsed as Record<string, boolean>);
      } else {
        setCollapsedExercises({});
      }
    } catch {
      setCollapsedExercises({});
    } finally {
      setLoadedCollapsedStateSessionId(numericSessionId);
    }
  }, [numericSessionId]);

  useEffect(() => {
    if (Number.isNaN(numericSessionId) || loadedCollapsedStateSessionId !== numericSessionId) {
      return;
    }

    try {
      window.localStorage.setItem(
        `${SESSION_COLLAPSED_STORAGE_KEY_PREFIX}${numericSessionId}`,
        JSON.stringify(collapsedExercises)
      );
    } catch {
      // Ignore storage errors (quota/private mode).
    }
  }, [collapsedExercises, loadedCollapsedStateSessionId, numericSessionId]);

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


  useEffect(() => {
    if (!payload) return;

    const grouped = new Map<string, SessionExerciseSet[]>();
    for (const set of payload.sets) {
      const current = grouped.get(set.sessionExerciseKey) ?? [];
      current.push(set);
      grouped.set(set.sessionExerciseKey, current);
    }

    setCollapsedExercises((prev) => {
      const next = { ...prev };
      for (const [key, sets] of grouped.entries()) {
        if (sets.length > 0 && sets.every((set) => set.completed)) {
          next[key] = true;
        }
      }
      return next;
    });
  }, [payload]);
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
          templateExerciseId: firstSet.templateExerciseId,
          x2Enabled: firstSet.x2Enabled ?? false
        };
      })
      .sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  }, [groupedSets]);

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }

  const isCompleted = payload.session.status === "completed";

  return (
    <section className="space-y-4 pb-6">
      <div className="space-y-1">
        <p className="text-base font-semibold leading-tight text-foreground/75">{payload.workout.workout.name}</p>
        {!isCompleted && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={ACTIVE_SESSION_PILL_CLASS}>
              {t("activeSession")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("since")} {formatSessionDateLabel(payload.session.startedAt, language)}
            </span>
          </div>
        )}
        {payload.previousSummary && payload.previousSummary.extraExercises.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("lastSessionExtras")}:{" "}
            {payload.previousSummary.extraExercises.map((item) => `${item.name} (${item.setCount} ${t("extraSets")})`).join(", ")}
          </p>
        )}
      </div>

      {sessionExercises.map((exercise) => {
        const isCollapsed = collapsedExercises[exercise.sessionExerciseKey] ?? false;
        const allCompleted = exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
        const lastTemplateSets =
          exercise.templateExerciseId !== undefined
            ? payload.previousSummary?.templateExerciseSets[exercise.templateExerciseId]
            : undefined;
        const lastSessionSetSummary = lastTemplateSets
          ?.sort((a, b) => a.templateSetOrder - b.templateSetOrder)
          .map((set) => `${set.actualReps ?? set.targetReps} x ${set.actualWeight ?? set.targetWeight} ${weightUnitLabel}`)
          .join(" | ");

        return (
          <Card key={exercise.sessionExerciseKey} className={`transition-all duration-200`}>
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="flex items-center gap-0.5"
                    aria-label={isCollapsed ? t("expandExercise") : t("collapseExercise")}
                    onClick={() =>
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exercise.sessionExerciseKey]: !isCollapsed
                      }))
                    }
                  >
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <CardTitle>{exercise.exerciseName}</CardTitle>
                  </button>
                  {exercise.x2Enabled && (
                    <span className="ml-1 rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                      2x
                    </span>
                  )}
                </div>
                {allCompleted && (
                  <span className={SUCCESS_CIRCLE_CLASS} aria-label={t("done")}>
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>

              {lastTemplateSets && (
                <p className="text-xs text-muted-foreground">
                  {t("lastSession")}: {lastSessionSetSummary}
                </p>
              )}
            </CardHeader>

            <div className={`grid transition-all duration-200 ${isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
              <div className="overflow-hidden">
              {exercise.exerciseNotes && (
                <div className="px-6 pt-0.5">
                  <p className="inline-flex items-start gap-1 text-xs text-muted-foreground">
                    <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{exercise.exerciseNotes}</span>
                  </p>
                </div>
              )}
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
                            className={`pr-14 ${set.completed ? "border-muted bg-muted/70 text-muted-foreground opacity-75" : ""}`}
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
                          <div className={`pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground ${set.completed ? "opacity-50" : ""}`}>
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
                            className={`pr-16 ${set.completed ? "border-muted bg-muted/70 text-muted-foreground opacity-75" : ""}`}
                            onCommit={(value) => {
                              void updateSessionSet(set.id!, {
                                actualWeight: value
                              });
                            }}
                          />
                          <div className={`pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground ${set.completed ? "opacity-50" : ""}`}>
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
                  <div className="flex items-center gap-2 border-t pt-2">
                    <ExerciseSearchLink exerciseName={exercise.exerciseName}/>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                      aria-label={t("removeExercise")}
                      onClick={async () => {
                        const sorted = [...exercise.sets].sort((a, b) => b.templateSetOrder - a.templateSetOrder);
                        if (sorted.length > 1) {
                          await removeSessionSet(sorted[0].id!);
                          return;
                        }

                        setDeleteExerciseTarget({ key: exercise.sessionExerciseKey });
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
              </div>
            </div>
          </Card>
        );
      })}

      {!isCompleted && !isAddExerciseExpanded && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
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

      {!isCompleted && isAddExerciseExpanded && (
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
                id="new-session-exercise"
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                placeholder={t("exerciseNamePlaceholder")}
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-md text-lg leading-none"
                onClick={async () => {
                  const trimmed = newExerciseName.trim();
                  if (!trimmed) {
                    return;
                  }

                  try {
                    await addSessionExercise(numericSessionId, trimmed);
                    setNewExerciseName("");
                    setIsAddExerciseExpanded(false);
                  } catch {
                    toast.error("Could not add exercise");
                  }
                }}
              >
                +
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="h-px bg-border" />

      {!isCompleted && (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => setIsCompleteDialogOpen(true)}>
            <Flag className="mr-2 h-4 w-4" />
            {t("completeSession")}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setIsDiscardDialogOpen(true)}>
            <OctagonX className="mr-2 h-4 w-4" />
            {t("discardSession")}
          </Button>
        </div>
      )}

      <Dialog open={deleteExerciseTarget !== null} onOpenChange={(open) => !open && setDeleteExerciseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeExercise")}</DialogTitle>
            <DialogDescription>{t("deleteExerciseConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExerciseTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={async () => {
                if (!deleteExerciseTarget) {
                  return;
                }
                await removeSessionExercise(numericSessionId, deleteExerciseTarget.key);
                setDeleteExerciseTarget(null);
              }}
            >
              {t("removeExercise")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
