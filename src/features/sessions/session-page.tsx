import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpDown, Check, ChevronDown, Flag, NotebookPen, OctagonX, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
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
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import { formatDurationClock, formatNumber, formatSessionDateLabel, getSetStatsMultiplier } from "@/lib/utils";

const ACTIVE_SESSION_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";
const SUCCESS_CIRCLE_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-500 dark:bg-emerald-800 dark:text-emerald-100";
const SESSION_COLLAPSED_STORAGE_KEY_PREFIX = "gymtracker:session-collapsed:";
const SESSION_SCROLL_STORAGE_KEY_PREFIX = "gymtracker:session-scroll:";
const EXERCISE_DONE_BADGE_DELAY_MS = 500;
const EXERCISE_AUTO_COLLAPSE_DELAY_MS = 1500;
const EXERCISE_DONE_BADGE_POP_DURATION_MS = 1500;
const UP_NEXT_BOX_CLASS = "relative overflow-hidden rounded-[20px] border";
const UP_NEXT_BOX_RADIUS_PX = 20;
const UP_NEXT_CARD_OVERLAP_PX = 33;

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

function formatInlineValue(value: number) {
  return `${value}`;
}

function PlaySolidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 6v12l10-6z" fill="currentColor" />
    </svg>
  );
}

function PauseSolidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="7" y="6" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="13" y="6" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function animateDoneBadgePop(node: HTMLSpanElement | null) {
  if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  node.animate(
    [
      { transform: "scale(0.45)", opacity: 0 },
      { transform: "scale(1.32)", opacity: 1, offset: 0.55 },
      { transform: "scale(0.92)", opacity: 1, offset: 0.82 },
      { transform: "scale(1)", opacity: 1 }
    ],
    {
      duration: EXERCISE_DONE_BADGE_POP_DURATION_MS,
      easing: "cubic-bezier(0.18, 0.95, 0.2, 1)"
    }
  );
}

function formatFinishedDurationLabel(durationMinutes: number, language: "de" | "en") {
  const roundedMinutes = Math.max(0, Math.round(durationMinutes));
  if (roundedMinutes < 60) {
    return language === "de" ? `${roundedMinutes} Minuten` : `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return language === "de"
    ? `${hours}:${String(minutes).padStart(2, "0")} Stunden`
    : `${hours}:${String(minutes).padStart(2, "0")} h`;
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
  const exerciseCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const exerciseDoneBadgeRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const pendingReorderAnimationRef = useRef<PendingReorderAnimation | null>(null);
  const restoredScrollLocationKeyRef = useRef<string | null>(null);
  const lastSavedScrollTopRef = useRef<number | null>(null);
  const exerciseCompletionTimersRef = useRef<Record<string, ExerciseCompletionFeedbackTimers>>({});
  const previousExerciseCompletionFeedbackRef = useRef<Record<string, ExerciseCompletionFeedbackState>>({});
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [sharedRestTimerUiState, setSharedRestTimerUiState] = useState<SharedRestTimerUiState | null>(null);

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
  const settings = useLiveQuery(async () => db.settings.get(1), []);

  useEffect(() => {
    if (Number.isNaN(numericSessionId)) {
      return;
    }
    clearAllExerciseCompletionFeedback();
    exerciseDoneBadgeRefs.current = {};
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
    return () => {
      clearAllExerciseCompletionFeedback(false);
      exerciseDoneBadgeRefs.current = {};
    };
  }, []);

  useEffect(() => {
    const previous = previousExerciseCompletionFeedbackRef.current;

    for (const [sessionExerciseKey, state] of Object.entries(exerciseCompletionFeedback)) {
      if (state !== "show-badge" || previous[sessionExerciseKey] === "show-badge") {
        continue;
      }
      animateDoneBadgePop(exerciseDoneBadgeRefs.current[sessionExerciseKey] ?? null);
    }

    previousExerciseCompletionFeedbackRef.current = exerciseCompletionFeedback;
  }, [exerciseCompletionFeedback]);

  useEffect(() => {
    const timerId = window.setInterval(() => setLiveNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const onRestTimerState = (event: Event) => {
      const customEvent = event as CustomEvent<{
        sessionId?: number;
        elapsedMs?: number;
        elapsedSeconds?: number;
        paused?: boolean;
        sinceIso?: string | null;
        emittedAtMs?: number;
      }>;
      if (customEvent.detail?.sessionId !== numericSessionId) {
        return;
      }

      setSharedRestTimerUiState({
        sessionId: numericSessionId,
        elapsedMs: Math.max(0, Math.floor(customEvent.detail.elapsedMs ?? 0)),
        elapsedSeconds: Math.max(0, Math.floor(customEvent.detail.elapsedSeconds ?? 0)),
        paused: customEvent.detail.paused === true,
        sinceIso: customEvent.detail.sinceIso ?? null,
        emittedAtMs: Math.max(0, Math.floor(customEvent.detail.emittedAtMs ?? Date.now()))
      });
    };

    window.addEventListener("gymtracker:rest-timer-state", onRestTimerState as EventListener);
    return () => {
      window.removeEventListener("gymtracker:rest-timer-state", onRestTimerState as EventListener);
    };
  }, [numericSessionId]);

  useEffect(() => {
    setSharedRestTimerUiState(null);
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
  const sessionExerciseOrderKey = useMemo(
    () => sessionExercises.map((exercise) => exercise.sessionExerciseKey).join("|"),
    [sessionExercises]
  );
  const unstartedExerciseCount = useMemo(
    () => sessionExercises.filter((exercise) => !exercise.sets.some((set) => set.completed)).length,
    [sessionExercises]
  );

  const findNextActionableSet = (sets: SessionExerciseSet[]) => {
    if (sets.length === 0) {
      return null;
    }

    let lastCompletedIndex = -1;
    for (let index = 0; index < sets.length; index += 1) {
      if (sets[index].completed) {
        lastCompletedIndex = index;
      }
    }

    const nextIncomplete =
      lastCompletedIndex >= 0
        ? sets.slice(lastCompletedIndex + 1).find((set) => !set.completed)
        : sets.find((set) => !set.completed);

    return nextIncomplete ?? sets.find((set) => !set.completed) ?? null;
  };

  const nextActionableSet = useMemo(() => findNextActionableSet(orderedSets), [orderedSets]);
  const nextActionableExercise = useMemo(
    () =>
      nextActionableSet
        ? sessionExercises.find((exercise) => exercise.sessionExerciseKey === nextActionableSet.sessionExerciseKey) ?? null
        : null,
    [nextActionableSet, sessionExercises]
  );
  const nextActionableSetIndex = useMemo(() => {
    if (!nextActionableSet) {
      return -1;
    }
    return orderedSets.findIndex((set) => set.id === nextActionableSet.id);
  }, [nextActionableSet, orderedSets]);
  const followingActionableSet = useMemo(() => {
    if (nextActionableSetIndex < 0) {
      return null;
    }
    return orderedSets.slice(nextActionableSetIndex + 1).find((set) => !set.completed) ?? null;
  }, [nextActionableSetIndex, orderedSets]);
  const followingActionableExercise = useMemo(
    () =>
      followingActionableSet
        ? sessionExercises.find((exercise) => exercise.sessionExerciseKey === followingActionableSet.sessionExerciseKey) ?? null
        : null,
    [followingActionableSet, sessionExercises]
  );
  const allSetsChecked = useMemo(
    () => orderedSets.length > 0 && orderedSets.every((set) => set.completed),
    [orderedSets]
  );
  const latestCompletedSet = useMemo(() => {
    let latest: SessionExerciseSet | null = null;
    let latestMs = -1;
    for (const set of orderedSets) {
      if (!set.completed || !set.completedAt) {
        continue;
      }
      const ms = new Date(set.completedAt).getTime();
      if (!Number.isFinite(ms) || ms <= latestMs) {
        continue;
      }
      latestMs = ms;
      latest = set;
    }
    return latest;
  }, [orderedSets]);
  const restTimerPanelState = useMemo(() => {
    if (
      isCompleted ||
      allSetsChecked ||
      !restTimerEnabled ||
      restTimerSeconds <= 0 ||
      !latestCompletedSet?.completedAt ||
      !nextActionableSet ||
      !nextActionableExercise
    ) {
      return null;
    }

    const completedAtMs = new Date(latestCompletedSet.completedAt).getTime();
    if (!Number.isFinite(completedAtMs)) {
      return null;
    }

    const sharedTimerStateMatches =
      sharedRestTimerUiState &&
      sharedRestTimerUiState.sessionId === numericSessionId &&
      sharedRestTimerUiState.sinceIso === latestCompletedSet.completedAt;
    const paused = sharedTimerStateMatches ? sharedRestTimerUiState.paused : false;
    const elapsedMs = sharedTimerStateMatches
      ? Math.max(
          0,
          sharedRestTimerUiState.elapsedMs +
            (sharedRestTimerUiState.paused ? 0 : Math.max(0, liveNowMs - sharedRestTimerUiState.emittedAtMs))
        )
      : Math.max(0, liveNowMs - completedAtMs);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    if (!Number.isFinite(elapsedMs) || elapsedMs >= restTimerSeconds * 1000) {
      return null;
    }

    const progressPercent = Math.max(0, Math.min(100, (elapsedMs / (restTimerSeconds * 1000)) * 100));
    return {
      elapsedSeconds,
      progressPercent,
      paused
    };
  }, [
    allSetsChecked,
    isCompleted,
    latestCompletedSet?.completedAt,
    liveNowMs,
    numericSessionId,
    nextActionableExercise,
    nextActionableSet,
    restTimerEnabled,
    restTimerSeconds,
    sharedRestTimerUiState
  ]);
  const completionStats = useMemo(() => {
    if (!payload) {
      return null;
    }

    const completedSets = orderedSets.filter((set) => set.completed);
    const setsForExerciseCount = completedSets.length > 0 ? completedSets : orderedSets;
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
    const finishedAt = payload.session.finishedAt ?? latestCompletedSet?.completedAt ?? new Date(liveNowMs).toISOString();
    const durationMinutes = getSessionDurationMinutes(payload.session.startedAt, finishedAt);
    const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);
    const calories = estimateStrengthTrainingCalories({
      durationMinutes,
      bodyWeightKg,
      completedSetCount: setCount,
      repsTotal
    });

    return {
      durationMinutes,
      exerciseCount,
      setCount,
      repsTotal,
      totalWeight,
      calories,
      usesDefaultBodyWeightForCalories: usesDefaultBodyWeight
    };
  }, [latestCompletedSet?.completedAt, liveNowMs, orderedSets, payload, settings?.bodyWeight, weightUnit]);

  const getSessionScrollStorageKey = (id: number) => `${SESSION_SCROLL_STORAGE_KEY_PREFIX}${id}`;

  const getPageScrollRoot = (): HTMLElement | null => {
    const candidate = document.scrollingElement ?? document.documentElement ?? document.body;
    return candidate instanceof HTMLElement ? candidate : null;
  };

  const readSavedSessionScrollTop = (id: number) => {
    try {
      const raw = window.localStorage.getItem(getSessionScrollStorageKey(id));
      if (!raw) {
        return null;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeSavedSessionScrollTop = (id: number, scrollTop: number) => {
    const normalized = Math.max(0, Math.round(scrollTop));
    if (lastSavedScrollTopRef.current === normalized) {
      return;
    }
    lastSavedScrollTopRef.current = normalized;
    try {
      window.localStorage.setItem(getSessionScrollStorageKey(id), String(normalized));
    } catch {
      // Ignore storage errors.
    }
  };

  const clearExerciseCompletionFeedbackTimers = (sessionExerciseKey: string) => {
    const timers = exerciseCompletionTimersRef.current[sessionExerciseKey];
    if (!timers) {
      return;
    }
    if (timers.badgeTimerId) {
      window.clearTimeout(timers.badgeTimerId);
    }
    if (timers.collapseTimerId) {
      window.clearTimeout(timers.collapseTimerId);
    }
    delete exerciseCompletionTimersRef.current[sessionExerciseKey];
  };

  const clearAllExerciseCompletionFeedback = (resetState = true) => {
    for (const key of Object.keys(exerciseCompletionTimersRef.current)) {
      clearExerciseCompletionFeedbackTimers(key);
    }
    previousExerciseCompletionFeedbackRef.current = {};
    if (resetState) {
      setExerciseCompletionFeedback({});
    }
  };

  const cancelExerciseCompletionFeedback = (sessionExerciseKey: string) => {
    clearExerciseCompletionFeedbackTimers(sessionExerciseKey);
    setExerciseCompletionFeedback((prev) => {
      if (!(sessionExerciseKey in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionExerciseKey];
      return next;
    });
  };

  const scheduleExerciseCompletionFeedback = (sessionExerciseKey: string) => {
    clearExerciseCompletionFeedbackTimers(sessionExerciseKey);
    setExerciseCompletionFeedback((prev) => ({
      ...prev,
      [sessionExerciseKey]: "pending-badge"
    }));

    const badgeTimerId = window.setTimeout(() => {
      setExerciseCompletionFeedback((prev) => {
        if (prev[sessionExerciseKey] !== "pending-badge") {
          return prev;
        }
        return {
          ...prev,
          [sessionExerciseKey]: "show-badge"
        };
      });
    }, EXERCISE_DONE_BADGE_DELAY_MS);

    const collapseTimerId = window.setTimeout(() => {
      setCollapsedExercises((prev) => ({
        ...prev,
        [sessionExerciseKey]: true
      }));
      delete exerciseCompletionTimersRef.current[sessionExerciseKey];
    }, EXERCISE_AUTO_COLLAPSE_DELAY_MS);

    exerciseCompletionTimersRef.current[sessionExerciseKey] = {
      badgeTimerId,
      collapseTimerId
    };
  };

  const animatePageScrollBy = (deltaY: number, durationMs = 220) => {
    if (Math.abs(deltaY) < 1) {
      return;
    }
    const scrollRoot = getPageScrollRoot();
    if (!scrollRoot) {
      window.scrollBy(0, deltaY);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scrollRoot.scrollTop += deltaY;
      return;
    }

    const startY = scrollRoot.scrollTop;
    const start = performance.now();
    const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      scrollRoot.scrollTop = startY + deltaY * easeOut(progress);
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      }
    };

    window.requestAnimationFrame(frame);
  };

  useEffect(() => {
    if (Number.isNaN(numericSessionId)) {
      return;
    }

    lastSavedScrollTopRef.current = readSavedSessionScrollTop(numericSessionId);
    let rafId = 0;
    const saveScrollPosition = () => {
      rafId = 0;
      const scrollRoot = getPageScrollRoot();
      if (!scrollRoot) {
        return;
      }
      writeSavedSessionScrollTop(numericSessionId, scrollRoot.scrollTop);
    };

    const onScroll = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(saveScrollPosition);
    };

    const saveNow = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      saveScrollPosition();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveNow();
      }
    };

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
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const currentScrollTop = getPageScrollRoot()?.scrollTop;
      if (typeof currentScrollTop === "number") {
        const rounded = Math.max(0, Math.round(currentScrollTop));
        const lastSaved = lastSavedScrollTopRef.current;
        if (!(rounded === 0 && (lastSaved ?? 0) > 0)) {
          writeSavedSessionScrollTop(numericSessionId, rounded);
        }
      }
      // Cleanup persists the last position, but skips transient route-transition resets to 0.
    };
  }, [numericSessionId]);

  useEffect(() => {
    if (
      Number.isNaN(numericSessionId) ||
      !payload ||
      loadedCollapsedStateSessionId !== numericSessionId ||
      restoredScrollLocationKeyRef.current === location.key
    ) {
      return;
    }

    const savedScrollTop = readSavedSessionScrollTop(numericSessionId);
    if (savedScrollTop === null) {
      return;
    }

    let frameId = 0;
    let attempts = 0;
    const maxAttempts = 120;
    const tryRestore = () => {
      attempts += 1;
      const scrollRoot = getPageScrollRoot();
      if (!scrollRoot) {
        restoredScrollLocationKeyRef.current = location.key;
        return;
      }

      const viewportHeight = window.innerHeight || scrollRoot.clientHeight || 0;
      const maxTop = Math.max(0, scrollRoot.scrollHeight - viewportHeight);
      const targetTop = Math.min(savedScrollTop, maxTop);
      scrollRoot.scrollTop = targetTop;

      const reached = Math.abs(scrollRoot.scrollTop - targetTop) < 2;
      const enoughHeight = maxTop >= savedScrollTop || attempts >= maxAttempts;
      if (reached && enoughHeight) {
        restoredScrollLocationKeyRef.current = location.key;
        return;
      }

      frameId = window.requestAnimationFrame(tryRestore);
    };

    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(tryRestore);
    });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [loadedCollapsedStateSessionId, location.key, numericSessionId, payload, sessionExerciseOrderKey]);

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
    sessionExerciseKey: string | null,
    beforeTop: number | null
  ) => {
    animateExerciseReorder(beforeTops);

    if (!sessionExerciseKey || beforeTop === null) {
      return;
    }
    const afterTop = exerciseCardRefs.current[sessionExerciseKey]?.getBoundingClientRect().top;
    if (typeof afterTop !== "number") {
      return;
    }
    animatePageScrollBy(afterTop - beforeTop);
  };

  const handleSetCompletedToggle = async (
    exercise: (typeof sessionExercises)[number],
    set: SessionExerciseSet,
    nextCompleted: boolean
  ) => {
    if (isCompleted || !set.id) {
      return;
    }

    if (!nextCompleted && set.completed) {
      cancelExerciseCompletionFeedback(exercise.sessionExerciseKey);
    }

    const beforeExerciseTop = exerciseCardRefs.current[exercise.sessionExerciseKey]?.getBoundingClientRect().top ?? null;
    const shouldCollapseAfterCheck =
      nextCompleted &&
      !set.completed &&
      exercise.sets.every((exerciseSet) => (exerciseSet.id === set.id ? true : exerciseSet.completed));

    await updateSessionSet(set.id, { completed: nextCompleted });

    if (shouldCollapseAfterCheck) {
      scheduleExerciseCompletionFeedback(exercise.sessionExerciseKey);
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

  const handleReverseExerciseOrder = async () => {
    if (isCompleted || unstartedExerciseCount < 2) {
      return;
    }

    const startedKeys: string[] = [];
    const unstartedKeys: string[] = [];
    for (const entry of sessionExercises) {
      if (entry.sets.some((set) => set.completed)) {
        startedKeys.push(entry.sessionExerciseKey);
      } else {
        unstartedKeys.push(entry.sessionExerciseKey);
      }
    }

    const nextOrder = [...startedKeys, ...unstartedKeys.reverse()];
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

  useEffect(() => {
    const pending = pendingReorderAnimationRef.current;
    if (!pending || pending.expectedOrderKey !== sessionExerciseOrderKey) {
      return;
    }

    pendingReorderAnimationRef.current = null;
    animateReorderAndKeepExerciseInView(
      pending.beforeTops,
      pending.followExerciseKey,
      pending.followExerciseBeforeTop
    );
  }, [sessionExerciseOrderKey]);

  useEffect(() => {
    const onCompleteNextSetRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId?: number }>;
      if (customEvent.detail?.sessionId !== numericSessionId || isCompleted) {
        return;
      }

      if (orderedSets.length === 0) {
        return;
      }

      const targetSet = findNextActionableSet(orderedSets);
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

  const handleCompleteUpNextSet = () => {
    if (!nextActionableSet?.id || !nextActionableExercise) {
      return;
    }
    void handleSetCompletedToggle(nextActionableExercise, nextActionableSet, true);
  };

  const getSetPositionLabel = (
    exercise: (typeof sessionExercises)[number] | null,
    set: SessionExerciseSet | null
  ) => {
    if (!exercise || !set) {
      return "";
    }
    const index = exercise.sets.findIndex((entry) => entry.id === set.id);
    if (index < 0) {
      return "";
    }
    return `${index + 1}/${exercise.sets.length}`;
  };

  const renderSetCardContent = ({
    exercise,
    set,
    compact = false,
    previewOnly = false,
    onDone,
    tone = "colored",
    inlineNoteInTitle = false
  }: {
    exercise: (typeof sessionExercises)[number] | null;
    set: SessionExerciseSet | null;
    compact?: boolean;
    previewOnly?: boolean;
    onDone?: () => void;
    tone?: "colored" | "neutral" | "neutral-muted";
    inlineNoteInTitle?: boolean;
  }) => {
    if (!exercise || !set) {
      return null;
    }

    const repsValue = set.actualReps ?? set.targetReps;
    const weightValue = set.actualWeight ?? set.targetWeight;
    const setPositionLabel = getSetPositionLabel(exercise, set);
    const isNeutralTone = tone !== "colored";
    const isMutedNeutralTone = tone === "neutral-muted";
    const titleClassName = compact ? "text-sm" : "text-[15px]";
    const metaClassName = compact ? "text-[11px]" : "text-xs";
    const valueClassName = compact ? "text-sm" : "text-base";
    const mainTextColorClass = isMutedNeutralTone ? "text-foreground/55" : "";
    const metaTextColorClass = isMutedNeutralTone ? "text-foreground/40" : "opacity-80";
    const noteLineTextColorClass = isMutedNeutralTone ? "text-foreground/45" : "opacity-85";
    const valueTextColorClass = isMutedNeutralTone ? "text-foreground/50" : "";
    const dotClassName = "mx-2 inline-block";

    return (
      <div className="flex items-stretch justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className={`${titleClassName} min-w-0 truncate font-semibold leading-tight ${mainTextColorClass}`}>
            <span className="truncate">{exercise.exerciseName}</span>
            {(setPositionLabel || (!previewOnly && inlineNoteInTitle && exercise.exerciseNotes)) && (
              <span className={`${metaClassName} min-w-0 font-medium ${metaTextColorClass}`}>
                {setPositionLabel ? <><span className={dotClassName} aria-hidden="true">·</span>{setPositionLabel}</> : null}
                {!previewOnly && inlineNoteInTitle && exercise.exerciseNotes ? (
                  <>
                    <span className={dotClassName} aria-hidden="true">·</span>
                    <span className="inline-flex min-w-0 max-w-[11rem] items-center gap-1 align-middle">
                      <NotebookPen className="h-[0.9em] w-[0.9em] shrink-0" />
                      <span className="min-w-0 truncate">{exercise.exerciseNotes}</span>
                    </span>
                  </>
                ) : null}
              </span>
            )}
          </p>
          {!previewOnly && !inlineNoteInTitle && exercise.exerciseNotes && (
            <p className={`${metaClassName} inline-flex min-w-0 items-center gap-1 leading-snug ${noteLineTextColorClass}`}>
              <NotebookPen className="h-[0.9em] w-[0.9em] shrink-0" />
              <span className="min-w-0 truncate">{exercise.exerciseNotes}</span>
            </p>
          )}
          {!previewOnly && (
            <p className={`${valueClassName} font-semibold tabular-nums ${valueTextColorClass}`}>
              {repsValue} × {formatNumber(weightValue, 0)} {weightUnitLabel}
            </p>
          )}
        </div>
        {!previewOnly && (
          <Button
            type="button"
            size="icon"
            onClick={onDone ?? handleCompleteUpNextSet}
            disabled={!set.id}
            aria-label={t("done")}
            className={`shrink-0 self-end rounded-full ${
              isNeutralTone
                ? "border border-input bg-background text-foreground hover:bg-secondary"
                : "border border-white/20 bg-white/15 text-white hover:bg-white/25"
            } ${
              compact ? "h-9 w-9" : "h-10 w-10"
            }`}
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  const handleToggleRestTimerFromPanel = () => {
    window.dispatchEvent(
      new CustomEvent("gymtracker:toggle-rest-timer", {
        detail: { sessionId: numericSessionId }
      })
    );
  };

  const upNextMode: "complete" | "rest" | "next" | null =
    isCompleted
      ? null
      : allSetsChecked
        ? "complete"
        : restTimerPanelState && nextActionableSet && nextActionableExercise
          ? "rest"
          : nextActionableSet && nextActionableExercise
            ? "next"
            : null;
  const upNextBottomCardPaddingTopPx = 12 + UP_NEXT_CARD_OVERLAP_PX;
  const currentCardTitle =
    upNextMode === "next"
      ? t("nextSet")
      : upNextMode === "rest"
        ? t("rest")
        : null;
  const showAfterCardTitle = upNextMode === "next" || upNextMode === "rest";
  const afterCardClassName =
    upNextMode === "complete"
      ? "text-blue-950 dark:text-blue-100"
      : "border-border bg-secondary/90 text-foreground backdrop-blur supports-[backdrop-filter]:bg-secondary/70";

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
      </div>

      {!isCompleted && upNextMode && (
        <section className="sticky top-16 z-10 isolate">
          <div
            className={`z-20 ${UP_NEXT_BOX_CLASS} ${
              upNextMode === "next"
                ? "border-emerald-400/40 bg-emerald-500 text-emerald-50"
                : upNextMode === "complete"
                  ? "border-white/15 text-white"
                  : "border-orange-200/80 bg-orange-100 text-orange-950 dark:border-orange-900/40 dark:bg-orange-950 dark:text-orange-100"
            }`}
            style={{
              ...(upNextMode === "complete" ? { backgroundColor: "var(--gt-session-complete-box)" } : {})
            }}
          >
            {upNextMode === "rest" && restTimerPanelState && (
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-orange-200/70 to-orange-400/75 transition-[width] ease-linear dark:from-orange-700/35 dark:to-orange-500/40"
                style={{
                  width: `${restTimerPanelState.progressPercent}%`,
                  transitionDuration: restTimerPanelState.paused ? "150ms" : "500ms"
                }}
                aria-hidden="true"
              />
            )}

            <div className="relative z-[1] flex flex-col px-4 py-3">
              {currentCardTitle && (
                <p className={`${upNextMode === "rest" ? "mb-0" : "mb-2"} text-[11px] font-medium uppercase tracking-wide ${
                  upNextMode === "complete"
                    ? "text-white/80"
                    : upNextMode === "next"
                      ? "text-emerald-50/80"
                      : "text-orange-900/75 dark:text-orange-100/80"
                }`}>
                  {currentCardTitle}
                </p>
              )}
              {upNextMode === "complete" && completionStats ? (
                <>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1">
                      <p className="text-[10px] text-white/75">{t("exercises")}</p>
                      <p className="text-[11px] font-semibold">{completionStats.exerciseCount}</p>
                    </div>
                    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1">
                      <p className="text-[10px] text-white/75">{t("sets")}</p>
                      <p className="text-[11px] font-semibold">{completionStats.setCount}</p>
                    </div>
                    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1">
                      <p className="text-[10px] text-white/75">{t("repsTotal")}</p>
                      <p className="text-[11px] font-semibold">{completionStats.repsTotal}</p>
                    </div>
                    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1">
                      <p className="text-[10px] text-white/75">{t("totalWeight")}</p>
                      <p className="text-[11px] font-semibold">{formatNumber(completionStats.totalWeight, 0)} {weightUnit}</p>
                    </div>
                    <div className="relative rounded-md border border-white/15 bg-white/10 px-2 py-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[10px] text-white/75">{t("calories")}</p>
                        {completionStats.usesDefaultBodyWeightForCalories && (
                          <InfoHint
                            ariaLabel={t("calories")}
                            text={t("caloriesEstimateAverageHint")}
                            className="-mr-1 -mt-0.5 shrink-0"
                          />
                        )}
                      </div>
                      <p className="text-[11px] font-semibold">~{formatNumber(completionStats.calories, 0)} kcal</p>
                    </div>
                    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1">
                      <p className="text-[10px] text-white/75">{t("duration")}</p>
                      <p className="text-[11px] font-semibold tabular-nums">
                        {formatFinishedDurationLabel(completionStats.durationMinutes, language)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end">
                    <Button
                      type="button"
                      className="w-full rounded-full border text-white hover:opacity-95"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--gt-session-complete-box) 88%, black)",
                        borderColor: "color-mix(in srgb, var(--gt-session-complete-box) 70%, white)"
                      }}
                      onClick={() => setIsCompleteDialogOpen(true)}
                    >
                      <Flag className="mr-2 h-4 w-4" />
                      {t("completeSession")}
                    </Button>
                  </div>
                </>
              ) : upNextMode === "rest" && restTimerPanelState ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-4 top-1/2 z-[2] h-10 w-10 -translate-y-1/2 shrink-0 border-orange-800/15 bg-white/45 text-orange-950 hover:bg-white/60 dark:border-orange-100/10 dark:bg-black/20 dark:text-orange-100 dark:hover:bg-black/30"
                    aria-label={restTimerPanelState.paused ? t("resumeSession") : t("pauseTimer")}
                    onClick={handleToggleRestTimerFromPanel}
                  >
                    {restTimerPanelState.paused ? <PlaySolidIcon className="h-4 w-4" /> : <PauseSolidIcon className="h-4 w-4" />}
                  </Button>
                  <div className="flex min-h-8 flex-1 items-center pr-12">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-tight tabular-nums text-orange-900/75 dark:text-orange-100/80">
                        {formatDurationClock(restTimerPanelState.elapsedSeconds)} / {formatDurationClock(restTimerSeconds)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-1 items-end overflow-hidden">
                    <div className="w-full">
                      {renderSetCardContent({
                        exercise: nextActionableExercise,
                        set: nextActionableSet,
                        onDone: handleCompleteUpNextSet,
                        inlineNoteInTitle: true
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {upNextMode !== "complete" && (
            <div
              className={`relative z-10 -mt-[33px] ${UP_NEXT_BOX_CLASS} px-4 pb-3 ${afterCardClassName}`}
              style={{
                paddingTop: `${upNextBottomCardPaddingTopPx}px`,
              }}
            >
              {showAfterCardTitle && (
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-foreground/35">
                  {t("afterward")}
                </p>
              )}

              {upNextMode === "next" && (
                <div className="overflow-hidden">
                  {followingActionableExercise && followingActionableSet ? (
                    renderSetCardContent({
                      exercise: followingActionableExercise,
                      set: followingActionableSet,
                      compact: true,
                      previewOnly: true,
                      tone: "neutral-muted"
                    })
                  ) : (
                    <div className="flex items-center gap-1 text-sm font-semibold text-foreground/45">
                      <Flag className="h-3 w-3 shrink-0" />
                      <span className="leading-tight">{t("completeSession")}</span>
                    </div>
                  )}
                </div>
              )}

              {upNextMode === "rest" && (
                <div className="overflow-hidden">
                  {renderSetCardContent({
                    exercise: nextActionableExercise,
                    set: nextActionableSet,
                    compact: true,
                    inlineNoteInTitle: true,
                    onDone: handleCompleteUpNextSet,
                    tone: "neutral-muted"
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {sessionExercises.map((exercise) => {
        const isCollapsed = collapsedExercises[exercise.sessionExerciseKey] ?? false;
        const allCompleted = exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
        const completionFeedbackState = exerciseCompletionFeedback[exercise.sessionExerciseKey];
        const showDoneBadge = isCompleted || (allCompleted && completionFeedbackState !== "pending-badge");
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
              <div className="flex min-h-5 items-start justify-between gap-2">
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
                    <span
                      ref={(node) => {
                        exerciseDoneBadgeRefs.current[exercise.sessionExerciseKey] = node;
                      }}
                      className={`${SUCCESS_CIRCLE_CLASS} transition-all duration-200 ease-out ${
                        showDoneBadge
                          ? "opacity-100 scale-100"
                          : "pointer-events-none opacity-0 scale-50"
                      }`}
                      aria-label={t("done")}
                    >
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
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <NotebookPen className="h-3 w-3 shrink-0" />
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
