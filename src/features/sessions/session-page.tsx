import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowUpDown, Check, Flag, History, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { SetValueDisplay } from "@/components/weights/weight-display";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import { db } from "@/db/db";
import {
  addSessionExercise,
  addSessionExerciseFromPrevious,
  completeSession,
  discardSession,
  getPreviousSessionSummary,
  getSessionById,
  reorderSessionExercises,
  removeSessionExercise,
  updateSessionSet
} from "@/db/repository";
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import {
  formatDurationLabel,
  formatSessionDateLabel,
  normalizeSessionExerciseSet,
  getSetRepsValue,
  getSetStatsMultiplier,
  getSetTotalWeight,
  getSetWeightValue
} from "@/lib/utils";
import type { SessionExercise } from "./components/exercise-card";
import { ExerciseCard } from "./components/exercise-card";
import type { UpNextMode, RestTimerPanelState } from "./components/up-next-panel";
import { UpNextPanel } from "./components/up-next-panel";
import { CompletionStats } from "./components/completion-stats";
import { ReorderableExerciseCard } from "./components/reorderable-exercise-card";
import {
  DeleteExerciseDialog,
  DiscardSessionDialog,
  CompleteSessionDialog,
  ReverseSessionOrderDialog
} from "./components/session-dialogs";

const ACTIVE_SESSION_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";
const SESSION_COLLAPSED_STORAGE_KEY_PREFIX = "gymtracker:session-collapsed:";
const SESSION_SCROLL_ANCHOR_STORAGE_KEY_PREFIX = "gymtracker:session-scroll-anchor:";
const EXERCISE_DONE_BADGE_DELAY_MS = 500;
const EXERCISE_DONE_BADGE_POP_DURATION_MS = 1500;
const LAST_SESSION_SECTION_LABEL_CLASS = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70";
const LAST_SESSION_SUMMARY_PILL_CLASS =
  "inline-flex rounded-full border border-border/80 bg-transparent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/70";
const EXTRA_PREVIOUS_EXERCISE_ADD_BUTTON_CLASS =
  "h-8 w-8 shrink-0 self-center rounded-full p-0 text-foreground/55 hover:text-foreground/70";

interface TemplateExerciseMeta {
  aiInfo?: ExerciseAiInfo;
  negativeWeightEnabled: boolean;
}

type ExerciseCompletionFeedbackState = "pending-badge" | "show-badge";

interface ExerciseCompletionFeedbackTimers {
  badgeTimerId?: number;
}

interface SharedRestTimerUiState {
  sessionId: number;
  elapsedMs: number;
  elapsedSeconds: number;
  paused: boolean;
  sinceIso: string | null;
  emittedAtMs: number;
}

interface PendingReorderAnimation {
  expectedOrderKey: string;
  beforeTops: Map<string, number>;
  followExerciseKey: string | null;
  followExerciseBeforeTop: number | null;
  followBehaviour: "keep-visible" | "preserve-offset";
}

function animateDoneBadgePop(node: HTMLSpanElement | null) {
  if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  node.animate(
    [
      { transform: "scale(0.45)", opacity: 0 },
      { transform: "scale(1.32)", opacity: 1, offset: 0.55 },
      { transform: "scale(0.92)", opacity: 1, offset: 0.82 },
      { transform: "scale(1)", opacity: 1 }
    ],
    { duration: EXERCISE_DONE_BADGE_POP_DURATION_MS, easing: "cubic-bezier(0.18, 0.95, 0.2, 1)" }
  );
}

export function SessionPage() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, weightUnit, weightUnitLabel, language, restTimerEnabled, restTimerSeconds } = useSettings();
  const numericSessionId = Number(sessionId);

  const [newExerciseName, setNewExerciseName] = useState("");
  const [isAddExerciseExpanded, setIsAddExerciseExpanded] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isReverseOrderDialogOpen, setIsReverseOrderDialogOpen] = useState(false);
  const [collapsedExercises, setCollapsedExercises] = useState<Record<string, boolean>>({});
  const [exerciseCompletionFeedback, setExerciseCompletionFeedback] = useState<Record<string, ExerciseCompletionFeedbackState>>({});
  const [loadedCollapsedStateSessionId, setLoadedCollapsedStateSessionId] = useState<number | null>(null);
  const [deleteExerciseTarget, setDeleteExerciseTarget] = useState<{ key: string } | null>(null);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [focusedWeightSetId, setFocusedWeightSetId] = useState<number | null>(null);
  const [sharedRestTimerUiState, setSharedRestTimerUiState] = useState<SharedRestTimerUiState | null>(null);
  const [draggedExerciseKey, setDraggedExerciseKey] = useState<string | null>(null);
  const [isDraggingExercise, setIsDraggingExercise] = useState(false);
  const [optimisticExerciseOrder, setOptimisticExerciseOrder] = useState<string[] | null>(null);
  const [adoptedPreviousExerciseKeys, setAdoptedPreviousExerciseKeys] = useState<string[]>([]);

  const exerciseCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const exerciseDoneBadgeRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const pendingReorderAnimationRef = useRef<PendingReorderAnimation | null>(null);
  const restoredScrollLocationKeyRef = useRef<string | null>(null);
  const latestCollapsedExercisesRef = useRef<Record<string, boolean>>({});
  const latestSessionExercisesRef = useRef<SessionExercise[]>([]);
  const latestLoadedCollapsedStateSessionIdRef = useRef<number | null>(null);
  const exerciseCompletionTimersRef = useRef<Record<string, ExerciseCompletionFeedbackTimers>>({});
  const previousExerciseCompletionFeedbackRef = useRef<Record<string, ExerciseCompletionFeedbackState>>({});
  const collapsedBeforeReorderRef = useRef<Record<string, boolean> | null>(null);
  const upNextPanelRef = useRef<HTMLElement | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 0 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Data queries ──────────────────────────────────────────────────────────

  const payload = useLiveQuery(async () => {
    if (Number.isNaN(numericSessionId)) return null;
    const sessionPayload = await getSessionById(numericSessionId);
    if (!sessionPayload) return null;
    const previousSummary = await getPreviousSessionSummary(
      sessionPayload.session.workoutId,
      sessionPayload.session.id!
    );
    return { ...sessionPayload, previousSummary };
  }, [numericSessionId]);

  const templateExerciseMetaMap = useLiveQuery(async () => {
    const templateIds = Array.from(
      new Set((payload?.sets ?? []).map((s) => s.templateExerciseId).filter((id): id is number => id !== undefined))
    );
    if (templateIds.length === 0) return new Map<number, TemplateExerciseMeta>();
    const exercises = await db.exercises.where("id").anyOf(templateIds).toArray();
    return new Map(
      exercises
        .filter((e): e is typeof e & { id: number } => e.id !== undefined)
        .map((e) => [
          e.id,
          {
            aiInfo: e.aiInfo,
            negativeWeightEnabled: e.negativeWeightEnabled ?? false
          }
        ])
    );
  }, [payload?.sets]);

  const settings = useLiveQuery(async () => db.settings.get(1), []);

  // ── Derived data ──────────────────────────────────────────────────────────

  const groupedSets = useMemo(() => {
    const map = new Map<string, SessionExerciseSet[]>();
    for (const set of payload?.sets ?? []) {
      const current = map.get(set.sessionExerciseKey) ?? [];
      current.push(set);
      map.set(set.sessionExerciseKey, current);
    }
    for (const [key, sets] of map.entries()) {
      map.set(key, sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder));
    }
    return map;
  }, [payload?.sets]);

  const sessionExercises = useMemo<SessionExercise[]>(() => {
    return [...groupedSets.entries()]
      .map(([sessionExerciseKey, sets]) => {
        const first = sets[0];
        const templateMeta =
          first.templateExerciseId !== undefined ? templateExerciseMetaMap?.get(first.templateExerciseId) : undefined;
        const negativeWeightEnabled =
          (templateMeta?.negativeWeightEnabled ?? false) ||
          first.negativeWeightEnabled === true ||
          sets.some((set) => (set.actualWeight ?? set.targetWeight) < 0 || set.targetWeight < 0);
        const normalizedSets = sets.map((set) =>
          normalizeSessionExerciseSet(set, { negativeWeightEnabled })
        );
        return {
          sessionExerciseKey,
          sets: normalizedSets,
          exerciseName: first.exerciseName,
          exerciseNotes: first.exerciseNotes,
          exerciseOrder: first.exerciseOrder,
          isTemplateExercise: first.isTemplateExercise,
          templateExerciseId: first.templateExerciseId,
          x2Enabled: first.x2Enabled ?? false,
          negativeWeightEnabled,
          exerciseAiInfo: first.exerciseAiInfo ?? templateMeta?.aiInfo
        };
      })
      .sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  }, [groupedSets, templateExerciseMetaMap]);

  const lockedExerciseKeys = useMemo(() => {
    const locked = new Set<string>();
    for (const exercise of sessionExercises) {
      if (exercise.sets.length === 0 || !exercise.sets.every((s) => s.completed)) break;
      locked.add(exercise.sessionExerciseKey);
    }
    return locked;
  }, [sessionExercises]);

  const sessionExerciseOrder = useMemo(
    () => sessionExercises.map((exercise) => exercise.sessionExerciseKey),
    [sessionExercises]
  );
  const displayExerciseOrder = useMemo(() => {
    if (!optimisticExerciseOrder) return sessionExerciseOrder;
    if (optimisticExerciseOrder.length !== sessionExerciseOrder.length) return sessionExerciseOrder;
    const sessionKeySet = new Set(sessionExerciseOrder);
    if (optimisticExerciseOrder.some((key) => !sessionKeySet.has(key))) return sessionExerciseOrder;
    return optimisticExerciseOrder;
  }, [optimisticExerciseOrder, sessionExerciseOrder]);
  const displayExercises = useMemo(() => {
    const byKey = new Map(sessionExercises.map((exercise) => [exercise.sessionExerciseKey, exercise]));
    return displayExerciseOrder
      .map((key) => byKey.get(key))
      .filter((exercise): exercise is SessionExercise => exercise !== undefined);
  }, [displayExerciseOrder, sessionExercises]);
  const availablePreviousExtraExercises = useMemo(() => {
    const currentExerciseNames = new Set(sessionExercises.map((exercise) => exercise.exerciseName.trim().toLowerCase()));
    const adoptedKeys = new Set(adoptedPreviousExerciseKeys);
    return (payload?.previousSummary?.extraExercises ?? []).flatMap((item, index) => {
      const key = `${item.name.trim().toLowerCase()}-${index}`;
      if (adoptedKeys.has(key) || currentExerciseNames.has(item.name.trim().toLowerCase())) {
        return [];
      }
      return [{ item, sourceIndex: index, key }];
    });
  }, [adoptedPreviousExerciseKeys, payload?.previousSummary?.extraExercises, sessionExercises]);

  const isCompleted = payload?.session.status === "completed";
  const orderedSets = useMemo(() => sessionExercises.flatMap((e) => e.sets), [sessionExercises]);
  const sessionExerciseOrderKey = useMemo(
    () => sessionExercises.map((e) => e.sessionExerciseKey).join("|"),
    [sessionExercises]
  );
  const unstartedExerciseCount = useMemo(
    () => sessionExercises.filter((e) => !e.sets.some((s) => s.completed)).length,
    [sessionExercises]
  );
  const allSetsChecked = useMemo(
    () => orderedSets.length > 0 && orderedSets.every((s) => s.completed),
    [orderedSets]
  );

  const findNextActionableSet = (sets: SessionExerciseSet[]) => {
    if (sets.length === 0) return null;
    let lastCompletedIndex = -1;
    for (let i = 0; i < sets.length; i += 1) {
      if (sets[i].completed) lastCompletedIndex = i;
    }
    const slice = lastCompletedIndex >= 0 ? sets.slice(lastCompletedIndex + 1) : sets;
    return slice.find((s) => !s.completed) ?? sets.find((s) => !s.completed) ?? null;
  };

  const nextActionableSet = useMemo(() => findNextActionableSet(orderedSets), [orderedSets]);
  const nextActionableExercise = useMemo(
    () => nextActionableSet
      ? sessionExercises.find((e) => e.sessionExerciseKey === nextActionableSet.sessionExerciseKey) ?? null
      : null,
    [nextActionableSet, sessionExercises]
  );

  const latestCompletedSet = useMemo(() => {
    let latest: SessionExerciseSet | null = null;
    let latestMs = -1;
    for (const set of orderedSets) {
      if (!set.completed || !set.completedAt) continue;
      const ms = new Date(set.completedAt).getTime();
      if (!Number.isFinite(ms) || ms <= latestMs) continue;
      latestMs = ms;
      latest = set;
    }
    return latest;
  }, [orderedSets]);

  const restTimerPanelState = useMemo<RestTimerPanelState | null>(() => {
    if (
      isCompleted || allSetsChecked || !restTimerEnabled || restTimerSeconds <= 0 ||
      !nextActionableSet || !nextActionableExercise
    ) return null;

    if (!latestCompletedSet?.completedAt) {
      return {
        elapsedSeconds: 0,
        progressPercent: 0,
        paused: false,
        hasStarted: false,
        isExpired: false
      };
    }

    const completedAtMs = new Date(latestCompletedSet.completedAt).getTime();
    if (!Number.isFinite(completedAtMs)) return null;

    const sharedMatches =
      sharedRestTimerUiState &&
      sharedRestTimerUiState.sessionId === numericSessionId &&
      sharedRestTimerUiState.sinceIso === latestCompletedSet.completedAt;
    const paused = sharedMatches ? sharedRestTimerUiState.paused : false;
    const elapsedMs = sharedMatches
      ? Math.max(0, sharedRestTimerUiState.elapsedMs + (paused ? 0 : Math.max(0, liveNowMs - sharedRestTimerUiState.emittedAtMs)))
      : Math.max(0, liveNowMs - completedAtMs);

    if (!Number.isFinite(elapsedMs)) return null;

    return {
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      progressPercent: Math.max(0, Math.min(100, (elapsedMs / (restTimerSeconds * 1000)) * 100)),
      paused,
      hasStarted: true,
      isExpired: elapsedMs >= restTimerSeconds * 1000
    };
  }, [
    allSetsChecked, isCompleted, latestCompletedSet?.completedAt, liveNowMs,
    numericSessionId, nextActionableExercise, nextActionableSet,
    restTimerEnabled, restTimerSeconds, sharedRestTimerUiState
  ]);

  const completionStats = useMemo(() => {
    if (!payload) return null;
    const completedSets = orderedSets.filter((s) => s.completed);
    const setsForCount = completedSets.length > 0 ? completedSets : orderedSets;
    const exerciseCount = new Set(setsForCount.map((s) => s.sessionExerciseKey)).size;
    const setCount = completedSets.reduce((sum, s) => sum + getSetStatsMultiplier(s), 0);
    const repsTotal = completedSets.reduce((sum, set) => sum + getSetRepsValue(set) * getSetStatsMultiplier(set), 0);
    const finishedAt = payload.session.finishedAt ?? latestCompletedSet?.completedAt ?? new Date(liveNowMs).toISOString();
    const durationMinutes = getSessionDurationMinutes(payload.session.startedAt, finishedAt);
    const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);
    const totalWeight = completedSets.reduce((sum, set) => sum + getSetTotalWeight(set, bodyWeightKg), 0);
    const calories = estimateStrengthTrainingCalories({ durationMinutes, bodyWeightKg, completedSetCount: setCount, repsTotal });
    return { durationMinutes, exerciseCount, setCount, repsTotal, totalWeight, calories, usesDefaultBodyWeightForCalories: usesDefaultBodyWeight };
  }, [latestCompletedSet?.completedAt, liveNowMs, orderedSets, payload, settings?.bodyWeight, weightUnit]);

  const upNextMode: UpNextMode | null =
    isCompleted || allSetsChecked ? null
    : nextActionableSet && nextActionableExercise ? "next"
    : null;

  // ── Scroll persistence ────────────────────────────────────────────────────

  const getSessionScrollAnchorStorageKey = (id: number) => `${SESSION_SCROLL_ANCHOR_STORAGE_KEY_PREFIX}${id}`;

  const getPageScrollRoot = (): HTMLElement | null => {
    const candidate = document.scrollingElement ?? document.documentElement ?? document.body;
    return candidate instanceof HTMLElement ? candidate : null;
  };

  const readSavedSessionScrollAnchor = (id: number) => {
    try {
      const raw = window.localStorage.getItem(getSessionScrollAnchorStorageKey(id));
      return raw && raw.trim() ? raw : null;
    } catch {
      return null;
    }
  };

  const writeSavedSessionScrollAnchor = (id: number, sessionExerciseKey: string | null) => {
    try {
      if (!sessionExerciseKey) {
        window.localStorage.removeItem(getSessionScrollAnchorStorageKey(id));
        return;
      }
      window.localStorage.setItem(getSessionScrollAnchorStorageKey(id), sessionExerciseKey);
    } catch {
      // Ignore storage errors.
    }
  };

  const persistCollapsedExercises = (id: number, value: Record<string, boolean>) => {
    try {
      window.localStorage.setItem(`${SESSION_COLLAPSED_STORAGE_KEY_PREFIX}${id}`, JSON.stringify(value));
    } catch {
      // Ignore storage errors (quota/private mode).
    }
  };

  const buildCollapsedExercisesWithCompleted = (
    exercises: SessionExercise[],
    currentCollapsed: Record<string, boolean>
  ) => {
    let nextCollapsed = currentCollapsed;
    for (const exercise of exercises) {
      const isCompletedExercise = exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
      if (!isCompletedExercise || currentCollapsed[exercise.sessionExerciseKey] === true) continue;
      if (nextCollapsed === currentCollapsed) {
        nextCollapsed = { ...currentCollapsed };
      }
      nextCollapsed[exercise.sessionExerciseKey] = true;
    }
    return nextCollapsed;
  };

  const findCenteredSessionExerciseKey = (exercises: SessionExercise[]) => {
    const viewportCenter = window.innerHeight / 2;
    let nearestKey: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const exercise of exercises) {
      const card = exerciseCardRefs.current[exercise.sessionExerciseKey];
      if (!card) continue;
      const rect = card.getBoundingClientRect();
      if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
        return exercise.sessionExerciseKey;
      }
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestKey = exercise.sessionExerciseKey;
      }
    }
    return nearestKey;
  };

  const restoreCenteredSessionExercise = (sessionExerciseKey: string) => {
    const scrollRoot = getPageScrollRoot();
    const card = exerciseCardRefs.current[sessionExerciseKey];
    if (!scrollRoot || !card) {
      return false;
    }

    const viewportHeight = window.innerHeight || scrollRoot.clientHeight || 0;
    const viewportCenter = viewportHeight / 2;
    const rect = card.getBoundingClientRect();
    const currentCardCenter = rect.top + rect.height / 2;
    const maxTop = Math.max(0, scrollRoot.scrollHeight - viewportHeight);
    const targetTop = Math.max(0, Math.min(maxTop, scrollRoot.scrollTop + currentCardCenter - viewportCenter));
    scrollRoot.scrollTop = targetTop;

    const nextRect = card.getBoundingClientRect();
    const nextCardCenter = nextRect.top + nextRect.height / 2;
    return Math.abs(nextCardCenter - viewportCenter) < 2;
  };

  const scheduleRestoreCenteredSessionExercise = (sessionExerciseKey: string, onDone?: () => void) => {
    let frameId = 0;
    let attempts = 0;
    let cancelled = false;

    const cancel = () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
    };

    const tryRestore = () => {
      if (cancelled) {
        return;
      }
      attempts += 1;
      const didRestore = restoreCenteredSessionExercise(sessionExerciseKey);
      if (didRestore || attempts >= 120) {
        onDone?.();
        return;
      }
      frameId = window.requestAnimationFrame(tryRestore);
    };

    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(tryRestore);
    });

    const abortOnUserScrollIntent = () => {
      cancel();
    };

    window.addEventListener("wheel", abortOnUserScrollIntent, { passive: true });
    window.addEventListener("touchstart", abortOnUserScrollIntent, { passive: true });
    window.addEventListener("pointerdown", abortOnUserScrollIntent, { passive: true });

    return () => {
      window.removeEventListener("wheel", abortOnUserScrollIntent);
      window.removeEventListener("touchstart", abortOnUserScrollIntent);
      window.removeEventListener("pointerdown", abortOnUserScrollIntent);
      cancel();
    };
  };

  const persistSessionExitState = (syncState = true) => {
    if (Number.isNaN(numericSessionId) || latestLoadedCollapsedStateSessionIdRef.current !== numericSessionId) return;
    writeSavedSessionScrollAnchor(
      numericSessionId,
      findCenteredSessionExerciseKey(latestSessionExercisesRef.current)
    );
    const currentCollapsed = latestCollapsedExercisesRef.current;
    const nextCollapsed = buildCollapsedExercisesWithCompleted(latestSessionExercisesRef.current, currentCollapsed);
    if (nextCollapsed === currentCollapsed) return;
    latestCollapsedExercisesRef.current = nextCollapsed;
    persistCollapsedExercises(numericSessionId, nextCollapsed);
    if (syncState) {
      setCollapsedExercises(nextCollapsed);
    }
  };

  // ── Animation helpers ─────────────────────────────────────────────────────

  const animateExerciseReorder = (beforeTops: Map<string, number>) => {
    if (beforeTops.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const durationMs = 220;
    const animated = new Set<HTMLElement>();
    for (const [key, previousTop] of beforeTops.entries()) {
      const element = exerciseCardRefs.current[key];
      if (!element) continue;
      const deltaY = previousTop - element.getBoundingClientRect().top;
      if (Math.abs(deltaY) < 1) continue;
      animated.add(element);
      element.style.transition = "none";
      element.style.transform = `translateY(${deltaY}px)`;
      element.style.willChange = "transform";
    }
    if (animated.size === 0) return;
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
    const tops = new Map<string, number>();
    for (const [key, element] of Object.entries(exerciseCardRefs.current)) {
      if (element) tops.set(key, element.getBoundingClientRect().top);
    }
    return tops;
  };

  const getStickySessionInsetTop = () => {
    const rect = upNextPanelRef.current?.getBoundingClientRect();
    if (!rect || rect.bottom <= 0 || rect.top > 16) return 8;
    return rect.bottom + 8;
  };

  const animateReorderAndKeepExerciseInView = (
    beforeTops: Map<string, number>,
    sessionExerciseKey: string | null,
    beforeTop: number | null,
    followBehaviour: PendingReorderAnimation["followBehaviour"]
  ) => {
    animateExerciseReorder(beforeTops);
    if (!sessionExerciseKey || beforeTop === null) return;

    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animationDurationMs = shouldReduceMotion ? 0 : 280;
    const stopAtMs = performance.now() + animationDurationMs + 80;

    const keepExerciseVisible = () => {
      const element = exerciseCardRefs.current[sessionExerciseKey];
      const scrollRoot = getPageScrollRoot();
      if (!element || !scrollRoot) return;

      const desiredTop =
        followBehaviour === "keep-visible"
          ? getStickySessionInsetTop()
          : Math.max(beforeTop, getStickySessionInsetTop());
      const currentTop = element.getBoundingClientRect().top;
      const delta = currentTop - desiredTop;

      if (Math.abs(delta) > 1) {
        scrollRoot.scrollTop += delta;
      }

      if (performance.now() < stopAtMs) {
        window.requestAnimationFrame(keepExerciseVisible);
      }
    };

    window.requestAnimationFrame(keepExerciseVisible);
  };

  // ── DnD helpers ───────────────────────────────────────────────────────────

  const startReorderMode = () => {
    if (isCompleted || sessionExercises.length < 2) return;
    collapsedBeforeReorderRef.current = collapsedExercises;
    const allCollapsed = Object.fromEntries(sessionExercises.map((item) => [item.sessionExerciseKey, true]));
    setCollapsedExercises(allCollapsed);
    setIsAddExerciseExpanded(false);
    setOptimisticExerciseOrder(null);
    setIsReorderMode(true);
  };

  const stopReorderMode = () => {
    setIsReorderMode(false);
    setDraggedExerciseKey(null);
    setOptimisticExerciseOrder(null);
    const previousCollapsed = collapsedBeforeReorderRef.current;
    if (previousCollapsed) {
      setCollapsedExercises(previousCollapsed);
      collapsedBeforeReorderRef.current = null;
    }
  };

  // ── Exercise completion feedback ──────────────────────────────────────────

  const clearExerciseCompletionFeedbackTimers = (key: string) => {
    const timers = exerciseCompletionTimersRef.current[key];
    if (!timers) return;
    if (timers.badgeTimerId) window.clearTimeout(timers.badgeTimerId);
    delete exerciseCompletionTimersRef.current[key];
  };

  const clearAllExerciseCompletionFeedback = (resetState = true) => {
    for (const key of Object.keys(exerciseCompletionTimersRef.current)) {
      clearExerciseCompletionFeedbackTimers(key);
    }
    previousExerciseCompletionFeedbackRef.current = {};
    if (resetState) setExerciseCompletionFeedback({});
  };

  const cancelExerciseCompletionFeedback = (key: string) => {
    clearExerciseCompletionFeedbackTimers(key);
    setExerciseCompletionFeedback((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const scheduleExerciseCompletionFeedback = (key: string) => {
    clearExerciseCompletionFeedbackTimers(key);
    setExerciseCompletionFeedback((prev) => ({ ...prev, [key]: "pending-badge" }));

    const badgeTimerId = window.setTimeout(() => {
      setExerciseCompletionFeedback((prev) => {
        if (prev[key] !== "pending-badge") return prev;
        return { ...prev, [key]: "show-badge" };
      });
      delete exerciseCompletionTimersRef.current[key];
    }, EXERCISE_DONE_BADGE_DELAY_MS);
    exerciseCompletionTimersRef.current[key] = { badgeTimerId };
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSetCompletedToggle = async (
    exercise: SessionExercise,
    set: SessionExerciseSet,
    nextCompleted: boolean
  ) => {
    if (isCompleted || !set.id) return;

    if (!nextCompleted && set.completed) {
      cancelExerciseCompletionFeedback(exercise.sessionExerciseKey);
    }

    const shouldCollapse =
      nextCompleted &&
      !set.completed &&
      exercise.sets.every((s) => (s.id === set.id ? true : s.completed));

    await updateSessionSet(set.id, { completed: nextCompleted });

    if (shouldCollapse) scheduleExerciseCompletionFeedback(exercise.sessionExerciseKey);
  };

  const handleCompleteUpNextSet = () => {
    if (!nextActionableSet?.id || !nextActionableExercise) return;
    const key = nextActionableExercise.sessionExerciseKey;
    void handleSetCompletedToggle(nextActionableExercise, nextActionableSet, true);
    window.requestAnimationFrame(() => {
      const card = exerciseCardRefs.current[key];
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleReverseExerciseOrder = async () => {
    if (isCompleted || unstartedExerciseCount < 2) return;
    const started: string[] = [];
    const unstarted: string[] = [];
    for (const e of sessionExercises) {
      (e.sets.some((s) => s.completed) ? started : unstarted).push(e.sessionExerciseKey);
    }
    const nextOrder = [...started, ...unstarted.reverse()];
    pendingReorderAnimationRef.current = {
      expectedOrderKey: nextOrder.join("|"),
      beforeTops: captureExerciseCardTops(),
      followExerciseKey: null,
      followExerciseBeforeTop: null,
      followBehaviour: "preserve-offset"
    };
    try {
      await reorderSessionExercises(numericSessionId, nextOrder);
    } catch (error) {
      pendingReorderAnimationRef.current = null;
      throw error;
    }
  };

  const handleDndDragStart = (event: DragStartEvent) => {
    if (!isReorderMode) return;
    setIsDraggingExercise(true);
    setDraggedExerciseKey(String(event.active.id));
  };

  const handleDndDragEnd = async (event: DragEndEvent) => {
    setIsDraggingExercise(false);
    setDraggedExerciseKey(null);
    if (!isReorderMode) return;

    const activeKey = typeof event.active.id === "string" ? event.active.id : null;
    const overKey = typeof event.over?.id === "string" ? event.over.id : null;
    if (!activeKey || !overKey || activeKey === overKey) return;

    const currentOrder = displayExercises.map((exercise) => exercise.sessionExerciseKey);
    if (currentOrder.length < 2) return;

    const activeIndex = currentOrder.indexOf(activeKey);
    const overIndex = currentOrder.indexOf(overKey);
    if (activeIndex < 0 || overIndex < 0) return;

    const firstUnlockedIndex = currentOrder.findIndex((key) => !lockedExerciseKeys.has(key));
    if (firstUnlockedIndex < 0) return;
    if (activeIndex < firstUnlockedIndex || overIndex < firstUnlockedIndex) return;

    const nextOrder = arrayMove(currentOrder, activeIndex, overIndex);
    if (nextOrder.join("|") === currentOrder.join("|")) return;
    setOptimisticExerciseOrder(nextOrder);

    pendingReorderAnimationRef.current = {
      expectedOrderKey: nextOrder.join("|"),
      beforeTops: captureExerciseCardTops(),
      followExerciseKey: activeKey,
      followExerciseBeforeTop: exerciseCardRefs.current[activeKey]?.getBoundingClientRect().top ?? null,
      followBehaviour: "preserve-offset"
    };

    try {
      await reorderSessionExercises(numericSessionId, nextOrder);
    } catch {
      setOptimisticExerciseOrder(null);
      pendingReorderAnimationRef.current = null;
      toast.error("Reordering failed");
    }
  };

  const handleDndDragCancel = () => {
    setIsDraggingExercise(false);
    setDraggedExerciseKey(null);
  };

  const handleToggleRestTimer = () => {
    window.dispatchEvent(new CustomEvent("gymtracker:toggle-rest-timer", { detail: { sessionId: numericSessionId } }));
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (Number.isNaN(numericSessionId)) return;
    setIsReorderMode(false);
    setDraggedExerciseKey(null);
    setOptimisticExerciseOrder(null);
    setIsReverseOrderDialogOpen(false);
    collapsedBeforeReorderRef.current = null;
    clearAllExerciseCompletionFeedback();
    exerciseDoneBadgeRefs.current = {};
    setLoadedCollapsedStateSessionId(null);
    try {
      const raw = window.localStorage.getItem(`${SESSION_COLLAPSED_STORAGE_KEY_PREFIX}${numericSessionId}`);
      if (!raw) { setCollapsedExercises({}); setLoadedCollapsedStateSessionId(numericSessionId); return; }
      const parsed = JSON.parse(raw) as unknown;
      setCollapsedExercises(parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {});
    } catch {
      setCollapsedExercises({});
    } finally {
      setLoadedCollapsedStateSessionId(numericSessionId);
    }
  }, [numericSessionId]);

  useEffect(() => {
    setAdoptedPreviousExerciseKeys([]);
  }, [numericSessionId]);

  useEffect(() => {
    return () => {
      clearAllExerciseCompletionFeedback(false);
      exerciseDoneBadgeRefs.current = {};
    };
  }, []);

  useEffect(() => {
    if (isCompleted && isReorderMode) {
      stopReorderMode();
    }
  }, [isCompleted, isReorderMode]);

  useEffect(() => {
    if (isReorderMode && sessionExercises.length < 2) {
      stopReorderMode();
    }
  }, [isReorderMode, sessionExercises.length]);

  useEffect(() => {
    const previous = previousExerciseCompletionFeedbackRef.current;
    for (const [key, state] of Object.entries(exerciseCompletionFeedback)) {
      if (state !== "show-badge" || previous[key] === "show-badge") continue;
      animateDoneBadgePop(exerciseDoneBadgeRefs.current[key] ?? null);
    }
    previousExerciseCompletionFeedbackRef.current = exerciseCompletionFeedback;
  }, [exerciseCompletionFeedback]);

  useEffect(() => {
    const id = window.setInterval(() => setLiveNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onRestTimerState = (event: Event) => {
      const e = event as CustomEvent<{
        sessionId?: number; elapsedMs?: number; elapsedSeconds?: number;
        paused?: boolean; sinceIso?: string | null; emittedAtMs?: number;
      }>;
      if (e.detail?.sessionId !== numericSessionId) return;
      setSharedRestTimerUiState({
        sessionId: numericSessionId,
        elapsedMs: Math.max(0, Math.floor(e.detail.elapsedMs ?? 0)),
        elapsedSeconds: Math.max(0, Math.floor(e.detail.elapsedSeconds ?? 0)),
        paused: e.detail.paused === true,
        sinceIso: e.detail.sinceIso ?? null,
        emittedAtMs: Math.max(0, Math.floor(e.detail.emittedAtMs ?? Date.now()))
      });
    };
    window.addEventListener("gymtracker:rest-timer-state", onRestTimerState as EventListener);
    return () => window.removeEventListener("gymtracker:rest-timer-state", onRestTimerState as EventListener);
  }, [numericSessionId]);

  useEffect(() => { setSharedRestTimerUiState(null); }, [numericSessionId]);

  useEffect(() => {
    if (Number.isNaN(numericSessionId) || loadedCollapsedStateSessionId !== numericSessionId) return;
    persistCollapsedExercises(numericSessionId, collapsedExercises);
  }, [collapsedExercises, loadedCollapsedStateSessionId, numericSessionId]);

  useEffect(() => {
    latestCollapsedExercisesRef.current = collapsedExercises;
  }, [collapsedExercises]);

  useEffect(() => {
    latestSessionExercisesRef.current = sessionExercises;
  }, [sessionExercises]);

  useEffect(() => {
    latestLoadedCollapsedStateSessionIdRef.current = loadedCollapsedStateSessionId;
  }, [loadedCollapsedStateSessionId]);

  useEffect(() => {
    const onCompleteRequest = (event: Event) => {
      const e = event as CustomEvent<{ sessionId?: number }>;
      if (e.detail?.sessionId === numericSessionId) setIsCompleteDialogOpen(true);
    };
    window.addEventListener("gymtracker:complete-session", onCompleteRequest as EventListener);
    return () => window.removeEventListener("gymtracker:complete-session", onCompleteRequest as EventListener);
  }, [numericSessionId]);

  useEffect(() => {
    const onCompleteNextSet = (event: Event) => {
      const e = event as CustomEvent<{ sessionId?: number }>;
      if (e.detail?.sessionId !== numericSessionId || isCompleted || orderedSets.length === 0) return;
      const target = findNextActionableSet(orderedSets);
      if (!target?.id) return;
      const exercise = sessionExercises.find((ex) => ex.sessionExerciseKey === target.sessionExerciseKey);
      if (exercise) void handleSetCompletedToggle(exercise, target, true);
    };
    window.addEventListener("gymtracker:complete-next-session-set", onCompleteNextSet as EventListener);
    return () => window.removeEventListener("gymtracker:complete-next-session-set", onCompleteNextSet as EventListener);
  }, [handleSetCompletedToggle, isCompleted, numericSessionId, orderedSets, sessionExercises]);

  useEffect(() => {
    if (!optimisticExerciseOrder) return;
    if (optimisticExerciseOrder.join("|") === sessionExerciseOrderKey) {
      setOptimisticExerciseOrder(null);
    }
  }, [optimisticExerciseOrder, sessionExerciseOrderKey]);

  useEffect(() => {
    const pending = pendingReorderAnimationRef.current;
    if (!pending || pending.expectedOrderKey !== sessionExerciseOrderKey) return;
    pendingReorderAnimationRef.current = null;
    animateReorderAndKeepExerciseInView(
      pending.beforeTops,
      pending.followExerciseKey,
      pending.followExerciseBeforeTop,
      pending.followBehaviour
    );
  }, [sessionExerciseOrderKey]);

  useLayoutEffect(() => {
    if (Number.isNaN(numericSessionId)) return;
    let cancelRestore: (() => void) | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistSessionExitState();
        return;
      }
      const savedSessionExerciseKey = readSavedSessionScrollAnchor(numericSessionId);
      if (!savedSessionExerciseKey) return;
      cancelRestore?.();
      cancelRestore = scheduleRestoreCenteredSessionExercise(savedSessionExerciseKey);
    };
    const onPageHide = () => {
      persistSessionExitState();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      cancelRestore?.();
      persistSessionExitState(false);
    };
  }, [numericSessionId]);

  useEffect(() => {
    if (
      Number.isNaN(numericSessionId) || !payload ||
      loadedCollapsedStateSessionId !== numericSessionId ||
      restoredScrollLocationKeyRef.current === location.key
    ) return;

    const savedSessionExerciseKey = readSavedSessionScrollAnchor(numericSessionId);
    if (!savedSessionExerciseKey) return;

    return scheduleRestoreCenteredSessionExercise(savedSessionExerciseKey, () => {
      restoredScrollLocationKeyRef.current = location.key;
    });
  }, [loadedCollapsedStateSessionId, location.key, numericSessionId, payload, sessionExerciseOrderKey]);

  // ── Render ────────────────────────────────────────────────────────────────

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
              <span className={ACTIVE_SESSION_PILL_CLASS}>{t("activeSession")}</span>
              <span className="text-xs text-muted-foreground">
                {t("since")} {formatSessionDateLabel(payload.session.startedAt, language, { omitTodayLabel: true })}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isCompleted && !isReorderMode && upNextMode && (
        <UpNextPanel
          panelRef={(node) => { upNextPanelRef.current = node; }}
          mode={upNextMode}
          nextActionableSet={nextActionableSet}
          nextActionableExercise={nextActionableExercise}
          restTimerPanelState={restTimerPanelState}
          showRestTimer={restTimerEnabled && restTimerSeconds > 0}
          restTimerSeconds={restTimerSeconds}
          completionStats={completionStats}
          weightUnit={weightUnit}
          weightUnitLabel={weightUnitLabel}
          language={language}
          t={t}
          onCompleteUpNextSet={handleCompleteUpNextSet}
          onToggleRestTimer={handleToggleRestTimer}
          onOpenCompleteDialog={() => setIsCompleteDialogOpen(true)}
        />
      )}

      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        autoScroll={false}
        onDragStart={handleDndDragStart}
        onDragEnd={(event) => void handleDndDragEnd(event)}
        onDragCancel={handleDndDragCancel}
      >
        <SortableContext
          items={displayExercises.map((exercise) => exercise.sessionExerciseKey)}
          strategy={verticalListSortingStrategy}
        >
          <div className={isReorderMode ? "relative space-y-2 pr-7" : "space-y-2"}>
            {isReorderMode && (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-auto absolute inset-y-0 right-0 z-10 w-5 rounded-sm touch-pan-y dark:hidden"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, rgba(161, 161, 170, 0.28) 0px, rgba(161, 161, 170, 0.28) 1px, transparent 1px, transparent 8px)"
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-auto absolute inset-y-0 right-0 z-10 hidden w-5 rounded-sm touch-pan-y dark:block"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, rgba(113, 113, 122, 0.5) 0px, rgba(113, 113, 122, 0.5) 1px, transparent 1px, transparent 8px)"
                  }}
                />
              </>
            )}
            {displayExercises.map((exercise) => {
            const isCollapsed = isReorderMode ? true : (collapsedExercises[exercise.sessionExerciseKey] ?? false);
            const allCompleted = exercise.sets.length > 0 && exercise.sets.every((s) => s.completed);
            const completionFeedback = exerciseCompletionFeedback[exercise.sessionExerciseKey];
            const showDoneBadge = isCompleted || (allCompleted && completionFeedback !== "pending-badge");
            const isLocked = isReorderMode && lockedExerciseKeys.has(exercise.sessionExerciseKey);
            const lastTemplateSets =
              exercise.templateExerciseId !== undefined
                ? payload.previousSummary?.templateExerciseSets[exercise.templateExerciseId]
                : undefined;
            const lastSessionSets = (() => {
              if (!lastTemplateSets || lastTemplateSets.length === 0) return undefined;
              const sortedPrev = [...lastTemplateSets].sort((a, b) => a.templateSetOrder - b.templateSetOrder);
              const currentSets = exercise.sets; // already sorted by templateSetOrder
              const hasDeviation =
                sortedPrev.length !== currentSets.length ||
                sortedPrev.some((prevSet, i) => {
                  const currSet = currentSets[i];
                  if (!currSet) return true;
                  const prevReps = getSetRepsValue(prevSet);
                  const prevWeight = getSetWeightValue(prevSet);
                  const currentReps = getSetRepsValue(currSet);
                  const currentWeight = getSetWeightValue(currSet);
                  return prevReps !== currentReps || prevWeight !== currentWeight;
                });
              if (!hasDeviation) return undefined;
              return sortedPrev.map((set) =>
                normalizeSessionExerciseSet(set, { negativeWeightEnabled: exercise.negativeWeightEnabled })
              );
            })();

            return (
              <ReorderableExerciseCard
                key={exercise.sessionExerciseKey}
                exerciseKey={exercise.sessionExerciseKey}
                reorderMode={isReorderMode}
                isLocked={isLocked}
                cardRef={(node) => { exerciseCardRefs.current[exercise.sessionExerciseKey] = node; }}
              >
                {({ isDragging }) => (
                  <ExerciseCard
                    exercise={exercise}
                    sessionId={numericSessionId}
                    isCollapsed={isCollapsed}
                    showDoneBadge={showDoneBadge}
                    sessionIsCompleted={isCompleted}
                    lastSessionSets={lastSessionSets}
                    weightUnitLabel={weightUnitLabel}
                    focusedWeightSetId={focusedWeightSetId}
                    badgeRef={(node) => { exerciseDoneBadgeRefs.current[exercise.sessionExerciseKey] = node; }}
                    t={t}
                    reorderMode={isReorderMode}
                    isDragging={draggedExerciseKey === exercise.sessionExerciseKey && isDragging}
                    onToggleCollapse={() =>
                      !isReorderMode &&
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exercise.sessionExerciseKey]: !isCollapsed
                      }))
                    }
                    onSetCompletedToggle={(set, completed) => handleSetCompletedToggle(exercise, set, completed)}
                    onFocusChange={setFocusedWeightSetId}
                    onUpdateReps={async (set, value) => {
                      if (value === 0 && !isCompleted) {
                        await import("@/db/repository").then(({ removeSessionSet }) => removeSessionSet(set.id!));
                        return;
                      }
                      void updateSessionSet(set.id!, { actualReps: value });
                    }}
                    onUpdateWeight={(set, value) => void updateSessionSet(set.id!, { actualWeight: value })}
                    onRequestDeleteExercise={(key) => setDeleteExerciseTarget({ key })}
                  />
                )}
              </ReorderableExerciseCard>
            );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {!isCompleted && availablePreviousExtraExercises.length > 0 && (
        <div className="space-y-2">
          <p className={`${LAST_SESSION_SECTION_LABEL_CLASS} inline-flex items-center gap-1.5`}>
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("lastSessionExtras")}</span>
          </p>
          {availablePreviousExtraExercises.map(({ item, sourceIndex, key }) => {
            return (
              <div
                key={`${item.name}-${sourceIndex}`}
                className="rounded-lg border bg-secondary/45 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={EXTRA_PREVIOUS_EXERCISE_ADD_BUTTON_CLASS}
                    aria-label={t("addExercise")}
                    title={t("addExercise")}
                    onClick={async () => {
                      try {
                        await addSessionExerciseFromPrevious(numericSessionId, item.sets);
                        setAdoptedPreviousExerciseKeys((prev) => [...prev, key]);
                      } catch {
                        toast.error("Could not add exercise");
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 text-foreground/55" />
                  </Button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold leading-tight tracking-tight text-muted-foreground/70">{item.name}</p>
                    {item.sets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.sets.map((set, setIndex) => (
                        <span
                          key={`${item.name}-${sourceIndex}-${setIndex}`}
                          className={LAST_SESSION_SUMMARY_PILL_CLASS}
                        >
                          <SetValueDisplay
                            reps={getSetRepsValue(set)}
                            weight={getSetWeightValue(set)}
                            weightUnitLabel={weightUnitLabel}
                            iconClassName="text-muted-foreground/70"
                            className="gap-0.5"
                          />
                        </span>
                      ))}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isCompleted && !isAddExerciseExpanded && (
        <div className="flex items-center justify-between gap-2">
          {!isReorderMode ? (
            <>
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5"
                onClick={startReorderMode}
                disabled={sessionExercises.length < 2}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {t("reorderMode")}
              </Button>
            </>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5"
                aria-label={t("reverseSessionExerciseOrder")}
                title={t("reverseSessionExerciseOrder")}
                onClick={() => setIsReverseOrderDialogOpen(true)}
                disabled={unstartedExerciseCount < 2}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {t("reverseShort")}
              </Button>
              <Button variant="default" size="sm" className="h-8 gap-1.5" onClick={stopReorderMode}>
                <Check className="h-3.5 w-3.5" />
                {t("saveSorting")}
              </Button>
            </div>
          )}
        </div>
      )}

      {!isCompleted && !isReorderMode && isAddExerciseExpanded && (
        <Card className="relative">
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label={t("cancel")}
            onClick={() => { setNewExerciseName(""); setIsAddExerciseExpanded(false); }}
          >
            <X className="h-3 w-3" />
          </button>
          <CardContent className="space-y-2 pt-2">
            <label className="text-xs text-muted-foreground">{t("exerciseName")}</label>
            <div className="flex items-center gap-2">
              <Input
                id="new-session-exercise"
                value={newExerciseName}
                noSelectAll
                onChange={(e) => setNewExerciseName(e.target.value)}
                placeholder={t("exerciseNamePlaceholder")}
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-md text-lg leading-none"
                onClick={async () => {
                  const trimmed = newExerciseName.trim();
                  if (!trimmed) return;
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

      {!isCompleted && allSetsChecked && completionStats && (
        <CompletionStats
          stats={completionStats}
          weightUnit={weightUnit}
          durationLabel={formatDurationLabel(completionStats.durationMinutes, language)}
          t={t}
          showCompleteAction={false}
          variant="standalone"
        />
      )}

      {!isCompleted && (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => setIsCompleteDialogOpen(true)}>
            <Flag className="mr-2 h-4 w-4" />
            {t("completeSession")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setIsDiscardDialogOpen(true)}>
            <X className="mr-2 h-4 w-4" />
            {t("discardSession")}
          </Button>
        </div>
      )}

      <DeleteExerciseDialog
        open={deleteExerciseTarget !== null}
        onOpenChange={(open) => !open && setDeleteExerciseTarget(null)}
        onConfirm={async () => {
          if (!deleteExerciseTarget) return;
          await removeSessionExercise(numericSessionId, deleteExerciseTarget.key);
          setDeleteExerciseTarget(null);
        }}
        t={t}
      />

      <DiscardSessionDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onConfirm={async () => {
          await discardSession(numericSessionId);
          setIsDiscardDialogOpen(false);
          toast.success(t("sessionDiscarded"));
          navigate("/");
        }}
        t={t}
      />

      <CompleteSessionDialog
        open={isCompleteDialogOpen}
        onOpenChange={setIsCompleteDialogOpen}
        onCompleteWithoutTemplate={async () => {
          await completeSession(numericSessionId, false);
          toast.success(t("sessionCompleted"));
          navigate("/");
        }}
        onCompleteWithTemplate={async () => {
          await completeSession(numericSessionId, true);
          toast.success(t("sessionCompleted"));
          navigate("/");
        }}
        t={t}
      />

      <ReverseSessionOrderDialog
        open={isReverseOrderDialogOpen}
        onOpenChange={setIsReverseOrderDialogOpen}
        onConfirm={async () => {
          setIsReverseOrderDialogOpen(false);
          await handleReverseExerciseOrder();
        }}
        t={t}
      />
    </section>
  );
}
