import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpDown, Check, ChevronDown, Flag, NotebookPen, OctagonX, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Button } from "@/components/ui/button";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
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
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import { db } from "@/db/db";
import {
  addSessionExercise,
  addSessionSet,
  completeSession,
  discardSession,
  getPreviousSessionSummary,
  getSessionById,
  reorderSessionExercises,
  removeSessionExercise,
  removeSessionSet,
  updateSessionSet
} from "@/db/repository";
import { formatSessionDateLabel } from "@/lib/utils";

const ACTIVE_SESSION_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";
const SUCCESS_CIRCLE_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-500 dark:bg-emerald-800 dark:text-emerald-100";
const SESSION_COLLAPSED_STORAGE_KEY_PREFIX = "gymtracker:session-collapsed:";

function formatInlineValue(value: number) {
  return `${value}`;
}

export function SessionPage() {
  const { sessionId } = useParams();
  const location = useLocation();
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
  const exerciseCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const handledResumeJumpLocationKeyRef = useRef<string | null>(null);

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
  const templateExerciseInfoMap = useLiveQuery(async () => {
    const templateIds = Array.from(
      new Set((payload?.sets ?? []).map((set) => set.templateExerciseId).filter((id): id is number => id !== undefined))
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
  }, [payload?.sets]);

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
          x2Enabled: firstSet.x2Enabled ?? false,
          exerciseAiInfo:
            firstSet.exerciseAiInfo ??
            (firstSet.templateExerciseId !== undefined ? templateExerciseInfoMap?.get(firstSet.templateExerciseId) : undefined)
        };
      })
      .sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  }, [groupedSets, templateExerciseInfoMap]);

  const isCompleted = payload?.session.status === "completed";
  const orderedSets = useMemo(() => sessionExercises.flatMap((exercise) => exercise.sets), [sessionExercises]);

  const scrollToSet = (setId: number, behavior: ScrollBehavior = "auto") => {
    const element = setRowRefs.current[setId];
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: "center", behavior });
  };

  const animateWindowScrollBy = (deltaY: number, durationMs = 220) => {
    if (Math.abs(deltaY) < 1) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollBy(0, deltaY);
      return;
    }

    const startY = window.scrollY;
    const start = performance.now();
    const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      window.scrollTo({ top: startY + deltaY * easeOut(progress), behavior: "auto" });
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      }
    };

    window.requestAnimationFrame(frame);
  };

  const animateExerciseReorder = (beforeTops: Map<string, number>) => {
    if (beforeTops.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const durationMs = 220;
    const animated = new Set<HTMLElement>();
    for (const [key, previousTop] of beforeTops.entries()) {
      const element = exerciseCardRefs.current[key];
      if (!element) {
        continue;
      }
      const currentTop = element.getBoundingClientRect().top;
      const deltaY = previousTop - currentTop;
      if (Math.abs(deltaY) < 1) {
        continue;
      }

      animated.add(element);
      element.style.transition = "none";
      element.style.transform = `translateY(${deltaY}px)`;
      element.style.willChange = "transform";
    }

    if (animated.size === 0) {
      return;
    }

    void document.body.offsetHeight;

    window.requestAnimationFrame(() => {
      for (const element of animated) {
        element.style.transition = `transform ${durationMs}ms ease-out`;
        element.style.transform = "translateY(0)";
      }

      window.setTimeout(() => {
        for (const element of animated) {
          element.style.transition = "";
          element.style.transform = "";
          element.style.willChange = "";
        }
      }, durationMs + 40);
    });
  };

  const captureExerciseCardTops = () => {
    const beforeTops = new Map<string, number>();
    for (const [key, element] of Object.entries(exerciseCardRefs.current)) {
      if (!element) {
        continue;
      }
      beforeTops.set(key, element.getBoundingClientRect().top);
    }
    return beforeTops;
  };

  const animateReorderAndKeepExerciseInView = (
    beforeTops: Map<string, number>,
    sessionExerciseKey: string,
    beforeTop: number | null
  ) => {

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        animateExerciseReorder(beforeTops);

        if (beforeTop === null) {
          return;
        }
        const afterTop = exerciseCardRefs.current[sessionExerciseKey]?.getBoundingClientRect().top;
        if (typeof afterTop !== "number") {
          return;
        }
        animateWindowScrollBy(afterTop - beforeTop);
      });
    });
  };

  const handleSetCompletedToggle = async (
    exercise: (typeof sessionExercises)[number],
    set: SessionExerciseSet,
    nextCompleted: boolean
  ) => {
    if (isCompleted || !set.id) {
      return;
    }

    const beforeExerciseTop = exerciseCardRefs.current[exercise.sessionExerciseKey]?.getBoundingClientRect().top ?? null;
    const shouldCollapseAfterCheck =
      nextCompleted &&
      !set.completed &&
      exercise.sets.every((exerciseSet) => (exerciseSet.id === set.id ? true : exerciseSet.completed));

    await updateSessionSet(set.id, { completed: nextCompleted });

    if (shouldCollapseAfterCheck) {
      setCollapsedExercises((prev) => ({
        ...prev,
        [exercise.sessionExerciseKey]: true
      }));
    }

    if (!nextCompleted || set.completed) {
      return;
    }

    const firstUnstartedIndex = sessionExercises.findIndex((entry) => {
      const completedCount = entry.sets.reduce((count, entrySet) => {
        if (entry.sessionExerciseKey === exercise.sessionExerciseKey && entrySet.id === set.id) {
          return count + 1;
        }
        return count + (entrySet.completed ? 1 : 0);
      }, 0);
      return completedCount === 0;
    });
    const currentExerciseIndex = sessionExercises.findIndex(
      (entry) => entry.sessionExerciseKey === exercise.sessionExerciseKey
    );

    if (firstUnstartedIndex < 0 || currentExerciseIndex < 0 || currentExerciseIndex <= firstUnstartedIndex) {
      return;
    }

    const nextOrder = sessionExercises.map((entry) => entry.sessionExerciseKey);
    const [movedKey] = nextOrder.splice(currentExerciseIndex, 1);
    if (!movedKey) {
      return;
    }
    nextOrder.splice(firstUnstartedIndex, 0, movedKey);

    const beforeCardTops = captureExerciseCardTops();
    await reorderSessionExercises(numericSessionId, nextOrder);
    animateReorderAndKeepExerciseInView(beforeCardTops, exercise.sessionExerciseKey, beforeExerciseTop);
  };

  const handleReverseExerciseOrder = async () => {
    if (isCompleted || sessionExercises.length < 2) {
      return;
    }

    const nextOrder = sessionExercises.map((entry) => entry.sessionExerciseKey).reverse();
    await reorderSessionExercises(numericSessionId, nextOrder);
  };

  useEffect(() => {
    const navigationState = location.state as { jumpToLastCompletedSet?: boolean } | null;
    if (!navigationState?.jumpToLastCompletedSet || handledResumeJumpLocationKeyRef.current === location.key) {
      return;
    }

    handledResumeJumpLocationKeyRef.current = location.key;
    const lastCompletedSet = [...orderedSets]
      .filter((set): set is SessionExerciseSet & { id: number } => set.completed && set.id !== undefined)
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())[0];

    if (!lastCompletedSet) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollToSet(lastCompletedSet.id, "auto");
      });
    });
  }, [location.key, location.state, orderedSets, scrollToSet]);

  useEffect(() => {
    const onCompleteNextSetRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId?: number }>;
      if (customEvent.detail?.sessionId !== numericSessionId || isCompleted) {
        return;
      }

      if (orderedSets.length === 0) {
        return;
      }

      let lastCompletedIndex = -1;
      for (let index = 0; index < orderedSets.length; index += 1) {
        if (orderedSets[index].completed) {
          lastCompletedIndex = index;
        }
      }

      const targetSet =
        lastCompletedIndex >= 0
          ? orderedSets.slice(lastCompletedIndex + 1).find((set) => !set.completed)
          : orderedSets.find((set) => !set.completed);

      if (!targetSet?.id) {
        return;
      }

      const targetExercise = sessionExercises.find(
        (exercise) => exercise.sessionExerciseKey === targetSet.sessionExerciseKey
      );
      if (!targetExercise) {
        return;
      }

      void handleSetCompletedToggle(targetExercise, targetSet, true);
    };

    window.addEventListener("gymtracker:complete-next-session-set", onCompleteNextSetRequest as EventListener);
    return () => {
      window.removeEventListener("gymtracker:complete-next-session-set", onCompleteNextSetRequest as EventListener);
    };
  }, [handleSetCompletedToggle, isCompleted, numericSessionId, orderedSets, sessionExercises]);

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }

  return (
    <section className="space-y-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold leading-tight text-foreground/75">
            <WorkoutNameLabel name={payload.workout.workout.name} icon={payload.workout.workout.icon} />
          </p>
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
        {!isCompleted && (
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={t("reverseSessionExerciseOrder")}
            title={t("reverseSessionExerciseOrder")}
            onClick={() => void handleReverseExerciseOrder()}
            disabled={sessionExercises.length < 2}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
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
          .map((set) => `${set.actualReps ?? set.targetReps} × ${set.actualWeight ?? set.targetWeight} ${weightUnitLabel}`)
          .join(" | ");

        return (
          <Card
            key={exercise.sessionExerciseKey}
            ref={(node) => {
              exerciseCardRefs.current[exercise.sessionExerciseKey] = node;
            }}
            className="transition-all duration-200"
          >
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex flex-1 items-start gap-0.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-0.5 text-left"
                    aria-label={isCollapsed ? t("expandExercise") : t("collapseExercise")}
                    onClick={() =>
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exercise.sessionExerciseKey]: !isCollapsed
                      }))
                    }
                  >
                    <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <CardTitle className="min-w-0 flex-1 text-left leading-tight">{exercise.exerciseName}</CardTitle>
                  </button>
                  {exercise.x2Enabled && (
                    <span className="ml-1 rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                      ×2
                    </span>
                  )}
                </div>
                {allCompleted && (
                  <div className="flex items-center gap-1">
                    {isCompleted && (
                      <ExerciseInfoDialogButton
                        exerciseName={exercise.exerciseName}
                        aiInfo={exercise.exerciseAiInfo}
                      />
                    )}
                    <span className={SUCCESS_CIRCLE_CLASS} aria-label={t("done")}>
                      <Check className="h-3 w-3" />
                    </span>
                  </div>
                )}
                {!allCompleted && isCompleted && (
                  <ExerciseInfoDialogButton exerciseName={exercise.exerciseName} aiInfo={exercise.exerciseAiInfo} />
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
                    <div
                      key={set.id}
                      ref={(node) => {
                        if (set.id !== undefined) {
                          setRowRefs.current[set.id] = node;
                        }
                      }}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 py-1"
                    >
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
                          className={`rounded-md ${
                            set.completed
                              ? "bg-emerald-500 text-white hover:bg-emerald-500/90 dark:bg-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-700"
                              : ""
                          }`}
                          disabled={isCompleted}
                          onClick={() => void handleSetCompletedToggle(exercise, set, !set.completed)}
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
                    <ExerciseInfoDialogButton
                      exerciseName={exercise.exerciseName}
                      aiInfo={exercise.exerciseAiInfo}
                      className="h-8 w-8 rounded-md text-muted-foreground/70"
                    />
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
        <div className="flex">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setIsAddExerciseExpanded(true)}
            aria-label={t("addExercise")}
          >
            <Plus className="h-3.5 w-3.5" />
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
