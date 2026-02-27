import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpDown, Flag, OctagonX, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import { db } from "@/db/db";
import {
  addSessionExercise,
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
import { formatSessionDateLabel, getEffectiveSetWeight, getSetStatsMultiplier } from "@/lib/utils";
import type { SessionExercise } from "./components/exercise-card";
import { ExerciseCard } from "./components/exercise-card";
import type { UpNextMode, RestTimerPanelState } from "./components/up-next-panel";
import { UpNextPanel } from "./components/up-next-panel";
import { DeleteExerciseDialog, DiscardSessionDialog, CompleteSessionDialog } from "./components/session-dialogs";

const ACTIVE_SESSION_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";
const SESSION_COLLAPSED_STORAGE_KEY_PREFIX = "gymtracker:session-collapsed:";
const SESSION_SCROLL_STORAGE_KEY_PREFIX = "gymtracker:session-scroll:";
const EXERCISE_DONE_BADGE_DELAY_MS = 500;
const EXERCISE_AUTO_COLLAPSE_DELAY_MS = 1500;
const EXERCISE_DONE_BADGE_POP_DURATION_MS = 1500;

type ExerciseCompletionFeedbackState = "pending-badge" | "show-badge";

interface ExerciseCompletionFeedbackTimers {
  badgeTimerId?: number;
  collapseTimerId?: number;
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
  const [collapsedExercises, setCollapsedExercises] = useState<Record<string, boolean>>({});
  const [exerciseCompletionFeedback, setExerciseCompletionFeedback] = useState<Record<string, ExerciseCompletionFeedbackState>>({});
  const [loadedCollapsedStateSessionId, setLoadedCollapsedStateSessionId] = useState<number | null>(null);
  const [deleteExerciseTarget, setDeleteExerciseTarget] = useState<{ key: string } | null>(null);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [focusedWeightSetId, setFocusedWeightSetId] = useState<number | null>(null);
  const [sharedRestTimerUiState, setSharedRestTimerUiState] = useState<SharedRestTimerUiState | null>(null);

  const exerciseCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const exerciseDoneBadgeRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const pendingReorderAnimationRef = useRef<PendingReorderAnimation | null>(null);
  const restoredScrollLocationKeyRef = useRef<string | null>(null);
  const lastSavedScrollTopRef = useRef<number | null>(null);
  const exerciseCompletionTimersRef = useRef<Record<string, ExerciseCompletionFeedbackTimers>>({});
  const previousExerciseCompletionFeedbackRef = useRef<Record<string, ExerciseCompletionFeedbackState>>({});

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

  const templateExerciseInfoMap = useLiveQuery(async () => {
    const templateIds = Array.from(
      new Set((payload?.sets ?? []).map((s) => s.templateExerciseId).filter((id): id is number => id !== undefined))
    );
    if (templateIds.length === 0) return new Map<number, ExerciseAiInfo>();
    const exercises = await db.exercises.where("id").anyOf(templateIds).toArray();
    return new Map(
      exercises
        .filter((e): e is typeof e & { id: number } => e.id !== undefined && !!e.aiInfo)
        .map((e) => [e.id, e.aiInfo!])
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
        return {
          sessionExerciseKey,
          sets,
          exerciseName: first.exerciseName,
          exerciseNotes: first.exerciseNotes,
          exerciseOrder: first.exerciseOrder,
          isTemplateExercise: first.isTemplateExercise,
          templateExerciseId: first.templateExerciseId,
          x2Enabled: first.x2Enabled ?? false,
          negativeWeightEnabled: first.negativeWeightEnabled ?? false,
          exerciseAiInfo:
            first.exerciseAiInfo ??
            (first.templateExerciseId !== undefined ? templateExerciseInfoMap?.get(first.templateExerciseId) : undefined)
        };
      })
      .sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  }, [groupedSets, templateExerciseInfoMap]);

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
  const nextActionableSetIndex = useMemo(() => {
    if (!nextActionableSet) return -1;
    return orderedSets.findIndex((s) => s.id === nextActionableSet.id);
  }, [nextActionableSet, orderedSets]);
  const followingActionableSet = useMemo(() => {
    if (nextActionableSetIndex < 0) return null;
    return orderedSets.slice(nextActionableSetIndex + 1).find((s) => !s.completed) ?? null;
  }, [nextActionableSetIndex, orderedSets]);
  const followingActionableExercise = useMemo(
    () => followingActionableSet
      ? sessionExercises.find((e) => e.sessionExerciseKey === followingActionableSet.sessionExerciseKey) ?? null
      : null,
    [followingActionableSet, sessionExercises]
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
      !latestCompletedSet?.completedAt || !nextActionableSet || !nextActionableExercise
    ) return null;

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

    if (!Number.isFinite(elapsedMs) || elapsedMs >= restTimerSeconds * 1000) return null;

    return {
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      progressPercent: Math.max(0, Math.min(100, (elapsedMs / (restTimerSeconds * 1000)) * 100)),
      paused
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
    const repsTotal = completedSets.reduce((sum, s) => sum + (s.actualReps ?? s.targetReps) * getSetStatsMultiplier(s), 0);
    const finishedAt = payload.session.finishedAt ?? latestCompletedSet?.completedAt ?? new Date(liveNowMs).toISOString();
    const durationMinutes = getSessionDurationMinutes(payload.session.startedAt, finishedAt);
    const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);
    const totalWeight = completedSets.reduce(
      (sum, s) =>
        sum + getEffectiveSetWeight(s.actualWeight ?? s.targetWeight, bodyWeightKg) * (s.actualReps ?? s.targetReps) * getSetStatsMultiplier(s),
      0
    );
    const calories = estimateStrengthTrainingCalories({ durationMinutes, bodyWeightKg, completedSetCount: setCount, repsTotal });
    return { durationMinutes, exerciseCount, setCount, repsTotal, totalWeight, calories, usesDefaultBodyWeightForCalories: usesDefaultBodyWeight };
  }, [latestCompletedSet?.completedAt, liveNowMs, orderedSets, payload, settings?.bodyWeight, weightUnit]);

  const upNextMode: UpNextMode | null =
    isCompleted ? null
    : allSetsChecked ? "complete"
    : restTimerPanelState && nextActionableSet && nextActionableExercise ? "rest"
    : nextActionableSet && nextActionableExercise ? "next"
    : null;

  // ── Scroll persistence ────────────────────────────────────────────────────

  const getSessionScrollStorageKey = (id: number) => `${SESSION_SCROLL_STORAGE_KEY_PREFIX}${id}`;

  const getPageScrollRoot = (): HTMLElement | null => {
    const candidate = document.scrollingElement ?? document.documentElement ?? document.body;
    return candidate instanceof HTMLElement ? candidate : null;
  };

  const readSavedSessionScrollTop = (id: number) => {
    try {
      const raw = window.localStorage.getItem(getSessionScrollStorageKey(id));
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeSavedSessionScrollTop = (id: number, scrollTop: number) => {
    const normalized = Math.max(0, Math.round(scrollTop));
    if (lastSavedScrollTopRef.current === normalized) return;
    lastSavedScrollTopRef.current = normalized;
    try {
      window.localStorage.setItem(getSessionScrollStorageKey(id), String(normalized));
    } catch {
      // Ignore storage errors.
    }
  };

  // ── Animation helpers ─────────────────────────────────────────────────────

  const animatePageScrollBy = (deltaY: number, durationMs = 220) => {
    if (Math.abs(deltaY) < 1) return;
    const scrollRoot = getPageScrollRoot();
    if (!scrollRoot) { window.scrollBy(0, deltaY); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { scrollRoot.scrollTop += deltaY; return; }

    const startY = scrollRoot.scrollTop;
    const start = performance.now();
    const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      scrollRoot.scrollTop = startY + deltaY * easeOut(progress);
      if (progress < 1) window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  };

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

  const animateReorderAndKeepExerciseInView = (
    beforeTops: Map<string, number>,
    sessionExerciseKey: string | null,
    beforeTop: number | null
  ) => {
    animateExerciseReorder(beforeTops);
    if (!sessionExerciseKey || beforeTop === null) return;
    const afterTop = exerciseCardRefs.current[sessionExerciseKey]?.getBoundingClientRect().top;
    if (typeof afterTop === "number") animatePageScrollBy(afterTop - beforeTop);
  };

  // ── Exercise completion feedback ──────────────────────────────────────────

  const clearExerciseCompletionFeedbackTimers = (key: string) => {
    const timers = exerciseCompletionTimersRef.current[key];
    if (!timers) return;
    if (timers.badgeTimerId) window.clearTimeout(timers.badgeTimerId);
    if (timers.collapseTimerId) window.clearTimeout(timers.collapseTimerId);
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
    }, EXERCISE_DONE_BADGE_DELAY_MS);

    const collapseTimerId = window.setTimeout(() => {
      setCollapsedExercises((prev) => ({ ...prev, [key]: true }));
      delete exerciseCompletionTimersRef.current[key];
    }, EXERCISE_AUTO_COLLAPSE_DELAY_MS);

    exerciseCompletionTimersRef.current[key] = { badgeTimerId, collapseTimerId };
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

    const beforeExerciseTop = exerciseCardRefs.current[exercise.sessionExerciseKey]?.getBoundingClientRect().top ?? null;
    const shouldCollapse =
      nextCompleted &&
      !set.completed &&
      exercise.sets.every((s) => (s.id === set.id ? true : s.completed));

    await updateSessionSet(set.id, { completed: nextCompleted });

    if (shouldCollapse) scheduleExerciseCompletionFeedback(exercise.sessionExerciseKey);
    if (!nextCompleted || set.completed) return;

    const firstUnstartedIndex = sessionExercises.findIndex((entry) => {
      const completedCount = entry.sets.reduce((count, s) => {
        if (entry.sessionExerciseKey === exercise.sessionExerciseKey && s.id === set.id) return count + 1;
        return count + (s.completed ? 1 : 0);
      }, 0);
      return completedCount === 0;
    });
    const currentIndex = sessionExercises.findIndex((e) => e.sessionExerciseKey === exercise.sessionExerciseKey);

    if (firstUnstartedIndex < 0 || currentIndex < 0 || currentIndex <= firstUnstartedIndex) return;

    const nextOrder = sessionExercises.map((e) => e.sessionExerciseKey);
    const [movedKey] = nextOrder.splice(currentIndex, 1);
    if (!movedKey) return;
    nextOrder.splice(firstUnstartedIndex, 0, movedKey);

    const beforeCardTops = captureExerciseCardTops();
    pendingReorderAnimationRef.current = {
      expectedOrderKey: nextOrder.join("|"),
      beforeTops: beforeCardTops,
      followExerciseKey: exercise.sessionExerciseKey,
      followExerciseBeforeTop: beforeExerciseTop
    };
    try {
      await reorderSessionExercises(numericSessionId, nextOrder);
    } catch (error) {
      pendingReorderAnimationRef.current = null;
      throw error;
    }
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
      followExerciseBeforeTop: null
    };
    try {
      await reorderSessionExercises(numericSessionId, nextOrder);
    } catch (error) {
      pendingReorderAnimationRef.current = null;
      throw error;
    }
  };

  const handleToggleRestTimer = () => {
    window.dispatchEvent(new CustomEvent("gymtracker:toggle-rest-timer", { detail: { sessionId: numericSessionId } }));
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (Number.isNaN(numericSessionId)) return;
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
    return () => {
      clearAllExerciseCompletionFeedback(false);
      exerciseDoneBadgeRefs.current = {};
    };
  }, []);

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
    const pending = pendingReorderAnimationRef.current;
    if (!pending || pending.expectedOrderKey !== sessionExerciseOrderKey) return;
    pendingReorderAnimationRef.current = null;
    animateReorderAndKeepExerciseInView(pending.beforeTops, pending.followExerciseKey, pending.followExerciseBeforeTop);
  }, [sessionExerciseOrderKey]);

  useEffect(() => {
    if (Number.isNaN(numericSessionId)) return;
    lastSavedScrollTopRef.current = readSavedSessionScrollTop(numericSessionId);
    let rafId = 0;
    const saveScrollPosition = () => {
      rafId = 0;
      const root = getPageScrollRoot();
      if (root) writeSavedSessionScrollTop(numericSessionId, root.scrollTop);
    };
    const onScroll = () => { if (!rafId) rafId = window.requestAnimationFrame(saveScrollPosition); };
    const saveNow = () => { if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; } saveScrollPosition(); };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") saveNow(); };

    const scrollRoot = getPageScrollRoot();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (scrollRoot && scrollRoot !== document.documentElement && scrollRoot !== document.body) {
      scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll);
      if (scrollRoot && scrollRoot !== document.documentElement && scrollRoot !== document.body) {
        scrollRoot.removeEventListener("scroll", onScroll);
      }
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const currentTop = getPageScrollRoot()?.scrollTop;
      if (typeof currentTop === "number") {
        const rounded = Math.max(0, Math.round(currentTop));
        if (!(rounded === 0 && (lastSavedScrollTopRef.current ?? 0) > 0)) {
          writeSavedSessionScrollTop(numericSessionId, rounded);
        }
      }
    };
  }, [numericSessionId]);

  useEffect(() => {
    if (
      Number.isNaN(numericSessionId) || !payload ||
      loadedCollapsedStateSessionId !== numericSessionId ||
      restoredScrollLocationKeyRef.current === location.key
    ) return;

    const savedScrollTop = readSavedSessionScrollTop(numericSessionId);
    if (savedScrollTop === null) return;

    let frameId = 0;
    let attempts = 0;
    const tryRestore = () => {
      attempts += 1;
      const root = getPageScrollRoot();
      if (!root) { restoredScrollLocationKeyRef.current = location.key; return; }
      const viewportHeight = window.innerHeight || root.clientHeight || 0;
      const maxTop = Math.max(0, root.scrollHeight - viewportHeight);
      const targetTop = Math.min(savedScrollTop, maxTop);
      root.scrollTop = targetTop;
      if (Math.abs(root.scrollTop - targetTop) < 2 && (maxTop >= savedScrollTop || attempts >= 120)) {
        restoredScrollLocationKeyRef.current = location.key;
        return;
      }
      frameId = window.requestAnimationFrame(tryRestore);
    };
    frameId = window.requestAnimationFrame(() => { frameId = window.requestAnimationFrame(tryRestore); });
    return () => { if (frameId) window.cancelAnimationFrame(frameId); };
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
                {t("since")} {formatSessionDateLabel(payload.session.startedAt, language)}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isCompleted && upNextMode && (
        <UpNextPanel
          mode={upNextMode}
          nextActionableSet={nextActionableSet}
          nextActionableExercise={nextActionableExercise}
          followingActionableSet={followingActionableSet}
          followingActionableExercise={followingActionableExercise}
          restTimerPanelState={restTimerPanelState}
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

      {sessionExercises.map((exercise) => {
        const isCollapsed = collapsedExercises[exercise.sessionExerciseKey] ?? false;
        const allCompleted = exercise.sets.length > 0 && exercise.sets.every((s) => s.completed);
        const completionFeedback = exerciseCompletionFeedback[exercise.sessionExerciseKey];
        const showDoneBadge = isCompleted || (allCompleted && completionFeedback !== "pending-badge");
        const lastTemplateSets =
          exercise.templateExerciseId !== undefined
            ? payload.previousSummary?.templateExerciseSets[exercise.templateExerciseId]
            : undefined;
        const lastSessionSetSummary = lastTemplateSets
          ?.sort((a, b) => a.templateSetOrder - b.templateSetOrder)
          .map((s) => `${s.actualReps ?? s.targetReps} × ${s.actualWeight ?? s.targetWeight} ${weightUnitLabel}`)
          .join(" | ");

        return (
          <ExerciseCard
            key={exercise.sessionExerciseKey}
            exercise={exercise}
            sessionId={numericSessionId}
            isCollapsed={isCollapsed}
            showDoneBadge={showDoneBadge}
            sessionIsCompleted={isCompleted}
            lastSessionSetSummary={lastSessionSetSummary}
            weightUnitLabel={weightUnitLabel}
            focusedWeightSetId={focusedWeightSetId}
            cardRef={(node) => { exerciseCardRefs.current[exercise.sessionExerciseKey] = node; }}
            badgeRef={(node) => { exerciseDoneBadgeRefs.current[exercise.sessionExerciseKey] = node; }}
            t={t}
            onToggleCollapse={() =>
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
        );
      })}

      {!isCompleted && payload.previousSummary && payload.previousSummary.extraExercises.length > 0 && (
        <div className="space-y-1 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium">{t("lastSessionExtras")}</p>
          {payload.previousSummary.extraExercises.map((item, i) => (
            <p key={i}>
              {item.name}
              {item.sets.length > 0 && (
                <span className="ml-1 opacity-70">
                  ({item.sets.map((s) => `${s.actualReps ?? s.targetReps} × ${s.actualWeight ?? s.targetWeight} ${weightUnitLabel}`).join(" | ")})
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      {!isCompleted && !isAddExerciseExpanded && (
        <div className="flex items-center justify-between gap-2">
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
            variant="secondary"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={t("reverseSessionExerciseOrder")}
            title={t("reverseSessionExerciseOrder")}
            onClick={() => void handleReverseExerciseOrder()}
            disabled={unstartedExerciseCount < 2}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!isCompleted && isAddExerciseExpanded && (
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
    </section>
  );
}
