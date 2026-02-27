import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowUpDown, ChevronDown, GripVertical, PersonStanding, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DecimalInput } from "@/components/forms/decimal-input";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import { Switch } from "@/components/ui/switch";
import { WorkoutIconGlyph } from "@/components/workouts/workout-name-label";
import {
  createWorkout,
  deleteWorkout,
  getWorkoutById,
  updateWorkout,
  type WorkoutDraft
} from "@/db/repository";
import type { ExerciseAiInfo } from "@/db/types";
import { useSettings } from "@/app/settings-context";
import { getCachedExerciseAiInfo, setCachedExerciseAiInfoBatch } from "@/lib/exercise-ai-info-cache";
import {
  buildExerciseInfoForMatch,
  getExerciseCatalogSuggestions,
  matchExerciseCatalogEntry
} from "@/lib/exercise-catalog";
import { isCanonicalMuscleKey } from "@/lib/muscle-taxonomy";
import { WORKOUT_ICON_OPTIONS } from "@/lib/workout-icons";

interface WorkoutEditorPageProps {
  mode: "create" | "edit";
}

interface ExerciseInfoApiItem {
  inputName: string;
  targetMuscles: Array<{ muscleKey: string; muscle: string; involvementPercent: number }>;
  executionGuide: string;
  coachingTips: string[];
  matchedExerciseName?: string;
  matchStrategy?: "exact" | "compact" | "fuzzy";
  matchScore?: number;
}

interface GenerateExerciseInfoOptions {
  forceRefresh?: boolean;
  silent?: boolean;
}

function createEmptyDraft(): WorkoutDraft {
  return {
    name: "",
    icon: undefined,
    exercises: [
      {
        name: "",
        notes: "",
        x2Enabled: false,
        negativeWeightEnabled: false,
        sets: [
          { targetReps: 10, targetWeight: 10 },
          { targetReps: 10, targetWeight: 10 },
          { targetReps: 10, targetWeight: 10 }
        ]
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

function reverseExercises(draft: WorkoutDraft) {
  const next = structuredClone(draft);
  next.exercises.reverse();
  return next;
}

function reorderCollapsedExerciseMap(
  current: Record<number, boolean>,
  fromIndex: number,
  toIndex: number,
  length: number
) {
  if (fromIndex === toIndex || length <= 1) {
    return current;
  }

  const flags = Array.from({ length }, (_, index) => current[index] ?? false);
  const [moved] = flags.splice(fromIndex, 1);
  flags.splice(toIndex, 0, moved ?? false);

  const next: Record<number, boolean> = {};
  flags.forEach((isCollapsed, index) => {
    if (isCollapsed) {
      next[index] = true;
    }
  });
  return next;
}

function reverseCollapsedExerciseMap(current: Record<number, boolean>, length: number) {
  if (length <= 1) {
    return current;
  }

  const flags = Array.from({ length }, (_, index) => current[index] ?? false).reverse();
  const next: Record<number, boolean> = {};
  flags.forEach((isCollapsed, index) => {
    if (isCollapsed) {
      next[index] = true;
    }
  });
  return next;
}

function reorderList<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return items;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

function reverseList<T>(items: T[]) {
  return [...items].reverse();
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase();
}

function isExerciseInfoApiItem(value: unknown): value is ExerciseInfoApiItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.inputName === "string" &&
    typeof item.executionGuide === "string" &&
    Array.isArray(item.coachingTips) &&
    Array.isArray(item.targetMuscles)
  );
}

function hasExerciseAiInfo(info: ExerciseAiInfo | undefined): info is ExerciseAiInfo {
  return !!(
    info &&
    Array.isArray(info.targetMuscles) &&
    info.targetMuscles.length > 0 &&
    typeof info.executionGuide === "string" &&
    info.executionGuide.trim() &&
    Array.isArray(info.coachingTips) &&
    info.coachingTips.length > 0
  );
}

function needsCatalogMatchMetadataBackfill(info: ExerciseAiInfo | undefined) {
  return hasExerciseAiInfo(info) && info.sourceProvider === "local-catalog" && !info.matchedExerciseName?.trim();
}

function getExerciseNameSuggestions(exerciseName: string, language: "de" | "en") {
  const normalizedCurrentName = normalizeExerciseName(exerciseName);
  if (normalizedCurrentName.length < 3) {
    return [];
  }

  const primaryMatch = matchExerciseCatalogEntry(exerciseName);
  if (primaryMatch && (primaryMatch.strategy === "exact" || primaryMatch.strategy === "compact")) {
    return [];
  }

  const ranked = getExerciseCatalogSuggestions(exerciseName, language, { limit: 10, minScore: 0.46 });
  const topScore = ranked[0]?.score ?? 0;
  const minAllowedScore = Math.max(0.52, topScore - 0.16);

  return ranked
    .filter((item) => item.score >= minAllowedScore)
    .slice(0, 6)
    .map((item) => item.label.trim())
    .filter(Boolean)
    .filter((label, index, list) => list.indexOf(label) === index)
    .filter((label) => normalizeExerciseName(label) !== normalizedCurrentName);
}

function mergeExerciseInfosByExerciseName(
  currentDraft: WorkoutDraft,
  infosByNormalizedExerciseName: Map<string, ExerciseAiInfo>,
  options: { forceRefresh?: boolean } = {}
) {
  const forceRefresh = options.forceRefresh === true;
  const next = structuredClone(currentDraft);

  for (const exercise of next.exercises) {
    const key = normalizeExerciseName(exercise.name);
    if (!key) {
      continue;
    }

    if (!forceRefresh && hasExerciseAiInfo(exercise.aiInfo) && !needsCatalogMatchMetadataBackfill(exercise.aiInfo)) {
      continue;
    }

    const info = infosByNormalizedExerciseName.get(key);
    if (!info) {
      continue;
    }
    exercise.aiInfo = info;
  }

  return next;
}

function buildLocalExerciseInfoApiItems(language: "de" | "en", exerciseNames: string[]): ExerciseInfoApiItem[] {
  return exerciseNames.flatMap((inputName) => {
    const match = matchExerciseCatalogEntry(inputName);
    if (!match) {
      return [];
    }
    const item = buildExerciseInfoForMatch(match, language, inputName);
    return [
      {
        inputName: item.inputName,
        targetMuscles: item.targetMuscles,
        executionGuide: item.executionGuide,
        coachingTips: item.coachingTips,
        matchedExerciseName: item.matchedExerciseName,
        matchStrategy: item.matchStrategy,
        matchScore: item.matchScore
      }
    ];
  });
}

function markAutoAttempts(
  attemptedKeysRef: { current: Set<string> },
  language: "de" | "en",
  exerciseNames: string[]
) {
  for (const name of exerciseNames) {
    const key = normalizeExerciseName(name);
    if (!key) continue;
    attemptedKeysRef.current.add(`${language}::${key}`);
  }
}

export function WorkoutEditorPage({ mode }: WorkoutEditorPageProps) {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnitLabel, language } = useSettings();
  const exerciseUiKeyCounterRef = useRef(0);
  const createExerciseUiKey = () => {
    exerciseUiKeyCounterRef.current += 1;
    return `exercise-ui-${exerciseUiKeyCounterRef.current}`;
  };
  const [draft, setDraft] = useState<WorkoutDraft>(() => createEmptyDraft());
  const [exerciseUiKeys, setExerciseUiKeys] = useState<string[]>(() =>
    createEmptyDraft().exercises.map(() => {
      exerciseUiKeyCounterRef.current += 1;
      return `exercise-ui-${exerciseUiKeyCounterRef.current}`;
    })
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [collapsedExercises, setCollapsedExercises] = useState<Record<number, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isAddExerciseExpanded, setIsAddExerciseExpanded] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [deleteExerciseIndex, setDeleteExerciseIndex] = useState<number | null>(null);
  const [focusedWeightKey, setFocusedWeightKey] = useState<string | null>(null);
  const [isGeneratingExerciseInfo, setIsGeneratingExerciseInfo] = useState(false);
  const attemptedAutoExerciseInfoKeysRef = useRef<Set<string>>(new Set());
  const exerciseCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragIndexRef = useRef<number | null>(null);
  const pointerDragExerciseIndexRef = useRef<number | null>(null);
  const pointerDragPointerIdRef = useRef<number | null>(null);
  const pendingReorderAnimationRef = useRef<{ beforeTops: Map<string, number> } | null>(null);

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
        icon: existing.workout.icon,
        exercises: existing.exercises.map((item) => ({
          name: item.exercise.name,
          notes: item.exercise.notes ?? "",
          aiInfo: item.exercise.aiInfo,
          x2Enabled: item.exercise.x2Enabled ?? false,
          negativeWeightEnabled: item.exercise.negativeWeightEnabled ?? false,
          sets: item.sets.map((set) => ({
            targetReps: set.targetReps,
            targetWeight: set.targetWeight
          }))
        }))
      });
      setExerciseUiKeys(existing.exercises.map(() => createExerciseUiKey()));
      exerciseCardRefs.current = {};
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
        exercise.sets.every((set) => set.targetReps > 0 && (exercise.negativeWeightEnabled ? set.targetWeight <= 0 : set.targetWeight >= 0))
    );
  }, [draft]);

  const handleGenerateExerciseInfo = useCallback(async (options: GenerateExerciseInfoOptions = {}) => {
    const forceRefresh = options.forceRefresh === true;
    const silent = options.silent === true;
    const baseDraft = structuredClone(draft);

    if (baseDraft.exercises.every((exercise) => !exercise.name.trim())) {
      if (!silent) {
        toast.error(t("exerciseInfoGenerateNoExercises"));
      }
      return;
    }

    if (forceRefresh) {
      for (const exercise of baseDraft.exercises) {
        if (!exercise.name.trim()) {
          continue;
        }
        exercise.aiInfo = undefined;
      }
    }

    const existingInfoByName = new Map<string, ExerciseAiInfo>();
    let locallyFilledCount = 0;
    if (!forceRefresh) {
      for (const exercise of baseDraft.exercises) {
        const key = normalizeExerciseName(exercise.name);
        if (!key || !hasExerciseAiInfo(exercise.aiInfo) || existingInfoByName.has(key)) {
          continue;
        }
        existingInfoByName.set(key, exercise.aiInfo);
      }

      for (const exercise of baseDraft.exercises) {
        if (hasExerciseAiInfo(exercise.aiInfo) && !needsCatalogMatchMetadataBackfill(exercise.aiInfo)) {
          continue;
        }
        const key = normalizeExerciseName(exercise.name);
        if (!key) {
          continue;
        }
        const localInfo = existingInfoByName.get(key);
        if (!localInfo) {
          continue;
        }
        exercise.aiInfo = localInfo;
        locallyFilledCount += 1;
      }
    }

    let cacheFilledCount = 0;
    if (!forceRefresh) {
      for (const exercise of baseDraft.exercises) {
        if (hasExerciseAiInfo(exercise.aiInfo) && !needsCatalogMatchMetadataBackfill(exercise.aiInfo)) {
          continue;
        }
        const cachedInfo = getCachedExerciseAiInfo(language, exercise.name);
        if (!hasExerciseAiInfo(cachedInfo)) {
          continue;
        }
        exercise.aiInfo = cachedInfo;
        cacheFilledCount += 1;
      }
    }

    const missingNames = Array.from(
      new Set(
        baseDraft.exercises
          .filter((exercise) => !hasExerciseAiInfo(exercise.aiInfo) || needsCatalogMatchMetadataBackfill(exercise.aiInfo))
          .map((exercise) => exercise.name.trim())
          .filter(Boolean)
      )
    );

    const requestNames = silent
      ? missingNames.filter(
          (name) => !attemptedAutoExerciseInfoKeysRef.current.has(`${language}::${normalizeExerciseName(name)}`)
        )
      : missingNames;

    if (missingNames.length === 0 || requestNames.length === 0) {
      const totalReusedCount = locallyFilledCount + cacheFilledCount;
      if (totalReusedCount > 0) {
        const reusableInfoByName = new Map<string, ExerciseAiInfo>();
        for (const exercise of baseDraft.exercises) {
          if (!hasExerciseAiInfo(exercise.aiInfo)) {
            continue;
          }
          const key = normalizeExerciseName(exercise.name);
          if (!key) continue;
          reusableInfoByName.set(key, exercise.aiInfo);
        }

        setDraft((prev) => mergeExerciseInfosByExerciseName(prev, reusableInfoByName, { forceRefresh }));
        const reusableInfos = baseDraft.exercises.flatMap((exercise) =>
          hasExerciseAiInfo(exercise.aiInfo) ? [{ exerciseName: exercise.name, info: exercise.aiInfo }] : []
        );
        if (reusableInfos.length > 0) {
          setCachedExerciseAiInfoBatch(language, reusableInfos);
        }
        if (!silent) {
          toast.success(t("exerciseInfoGenerateSuccess").replace("{count}", String(totalReusedCount)));
        }
      }
      return;
    }

    setIsGeneratingExerciseInfo(true);
    try {
      let payload: {
        exercises?: unknown;
        sourceProvider?: string;
        sourceModel?: string;
      } = {};

      let usedLocalFallback = false;
      try {
        const response = await fetch("/api/exercise-info", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locale: language,
            exerciseNames: requestNames
          })
        });

        if (!response.ok) {
          let errorCode = "";
          let errorDetail = "";
          try {
            const errorPayload = (await response.json()) as { error?: string; detail?: string };
            errorCode = typeof errorPayload.error === "string" ? errorPayload.error : "";
            errorDetail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
          } catch {
            // ignore parse errors and fall back below
          }

          // In local dev / API outages, fall back to local matching in the frontend.
          payload = {
            exercises: buildLocalExerciseInfoApiItems(language, requestNames),
            sourceProvider: "local-catalog",
            sourceModel: "exercise-catalog-v1"
          };
          usedLocalFallback = true;

          if (Array.isArray(payload.exercises) && payload.exercises.length > 0) {
            // continue with parsed fallback payload below
          } else if (response.status === 404) {
            if (silent) {
              markAutoAttempts(attemptedAutoExerciseInfoKeysRef, language, requestNames);
            } else {
              toast.error(t("exerciseInfoEndpointUnavailable"));
            }
            return;
          } else if (errorCode.includes("GROQ_API_KEY") || errorDetail.includes("GROQ_API_KEY")) {
            if (silent) {
              markAutoAttempts(attemptedAutoExerciseInfoKeysRef, language, requestNames);
            } else {
              toast.error(t("exerciseInfoProviderNotConfigured"));
            }
            return;
          } else if (!silent) {
            toast.error(t("exerciseInfoGenerateFailed"));
            return;
          }
        } else {
          payload = (await response.json()) as {
            exercises?: unknown;
            sourceProvider?: string;
            sourceModel?: string;
          };
        }
      } catch {
        payload = {
          exercises: buildLocalExerciseInfoApiItems(language, requestNames),
          sourceProvider: "local-catalog",
          sourceModel: "exercise-catalog-v1"
        };
        usedLocalFallback = true;
      }

      if (silent) {
        markAutoAttempts(attemptedAutoExerciseInfoKeysRef, language, requestNames);
      }

      if (!usedLocalFallback && !Array.isArray(payload.exercises)) {
        if (!silent) {
          toast.error(t("exerciseInfoGenerateFailed"));
        }
        return;
      }

      const items = Array.isArray(payload.exercises) ? payload.exercises.filter(isExerciseInfoApiItem) : [];
      if (items.length === 0) {
        if (!silent) {
          toast.error(t("exerciseInfoGenerateFailed"));
        }
        return;
      }

      const generatedAt = new Date().toISOString();
      const infoByName = new Map<string, ExerciseAiInfo>();
      for (const item of items) {
        const key = normalizeExerciseName(item.inputName);
        if (!key) continue;

        const targetMuscles = item.targetMuscles
          .flatMap((muscle) => {
            if (!isCanonicalMuscleKey(muscle.muscleKey)) {
              return [];
            }

            return [
              {
                muscleKey: muscle.muscleKey,
                muscle: typeof muscle.muscle === "string" ? muscle.muscle.trim() : "",
                involvementPercent: Math.max(0, Math.min(100, Math.round(Number(muscle.involvementPercent) || 0)))
              }
            ];
          })
          .filter((muscle) => muscle.muscle);
        const coachingTips = item.coachingTips.map((tip) => tip.trim()).filter(Boolean);
        const executionGuide = item.executionGuide.trim();

        if (targetMuscles.length === 0 || coachingTips.length === 0 || !executionGuide) {
          continue;
        }

        infoByName.set(key, {
          targetMuscles,
          coachingTips,
          executionGuide,
          generatedAt,
          sourceProvider: typeof payload.sourceProvider === "string" ? payload.sourceProvider : "local-catalog",
          sourceModel: typeof payload.sourceModel === "string" ? payload.sourceModel : undefined,
          matchedExerciseName: typeof item.matchedExerciseName === "string" ? item.matchedExerciseName.trim() : undefined,
          matchStrategy:
            item.matchStrategy === "exact" || item.matchStrategy === "compact" || item.matchStrategy === "fuzzy"
              ? item.matchStrategy
              : undefined,
          matchScore:
            typeof item.matchScore === "number" && Number.isFinite(item.matchScore)
              ? Math.max(0, Math.min(1, item.matchScore))
              : undefined
        });
      }

      const cacheEntriesToPersist: Array<{ exerciseName: string; info: ExerciseAiInfo }> = [];
      let apiUpdatedCount = 0;
      for (const exercise of baseDraft.exercises) {
        if (!forceRefresh && hasExerciseAiInfo(exercise.aiInfo) && !needsCatalogMatchMetadataBackfill(exercise.aiInfo)) {
          continue;
        }
        const info = infoByName.get(normalizeExerciseName(exercise.name));
        if (!info) {
          continue;
        }
        exercise.aiInfo = info;
        cacheEntriesToPersist.push({ exerciseName: exercise.name, info });
        apiUpdatedCount += 1;
      }

      if (cacheEntriesToPersist.length > 0) {
        setCachedExerciseAiInfoBatch(language, cacheEntriesToPersist);
      }

      const totalUpdatedCount = locallyFilledCount + cacheFilledCount + apiUpdatedCount;
      if (totalUpdatedCount <= 0) {
        if (!silent) {
          toast.error(t("exerciseInfoGenerateFailed"));
        }
        return;
      }

      setDraft((prev) => mergeExerciseInfosByExerciseName(prev, infoByName, { forceRefresh }));
      if (!silent) {
        toast.success(t("exerciseInfoGenerateSuccess").replace("{count}", String(totalUpdatedCount)));
      }
    } catch {
      if (!silent) {
        toast.error(t("exerciseInfoGenerateFailed"));
      }
    } finally {
      setIsGeneratingExerciseInfo(false);
    }
  }, [draft, language, t]);

  useEffect(() => {
    if (isGeneratingExerciseInfo) {
      return;
    }

    const hasMissingNamedExercises = draft.exercises.some(
      (exercise) =>
        exercise.name.trim().length >= 3 &&
        (!hasExerciseAiInfo(exercise.aiInfo) || needsCatalogMatchMetadataBackfill(exercise.aiInfo))
    );
    if (!hasMissingNamedExercises) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleGenerateExerciseInfo({ silent: true });
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draft.exercises, handleGenerateExerciseInfo, isGeneratingExerciseInfo]);

  useEffect(() => {
    attemptedAutoExerciseInfoKeysRef.current.clear();
  }, [language]);

  const handleSave = useCallback(async () => {
    if (!isValid) {
      return;
    }

    try {
      setIsSaving(true);
      if (mode === "create") {
        await createWorkout(draft);
        toast.success(t("workoutCreated"));
      } else {
        await updateWorkout(Number(workoutId), draft);
        toast.success(t("workoutUpdated"));
      }
      navigate("/");
    } finally {
      setIsSaving(false);
    }
  }, [draft, isValid, mode, navigate, t, workoutId]);

  const handleCancel = useCallback(() => {
    navigate("/");
  }, [navigate]);

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

  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    const onSaveRequest = () => {
      void handleSave();
    };

    window.addEventListener("gymtracker:save-workout-editor", onSaveRequest);
    return () => {
      window.removeEventListener("gymtracker:save-workout-editor", onSaveRequest);
    };
  }, [mode, handleSave]);

  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    const onCancelRequest = () => {
      handleCancel();
    };

    window.addEventListener("gymtracker:cancel-workout-editor", onCancelRequest);
    return () => {
      window.removeEventListener("gymtracker:cancel-workout-editor", onCancelRequest);
    };
  }, [handleCancel, mode]);

  const hasExercises = draft.exercises.length > 0;
  const areAllExercisesCollapsed =
    hasExercises && draft.exercises.every((_, exerciseIndex) => collapsedExercises[exerciseIndex] ?? false);

  const handleToggleAllExercisesCollapsed = () => {
    setCollapsedExercises(() => {
      if (areAllExercisesCollapsed) {
        return {};
      }

      const next: Record<number, boolean> = {};
      for (let exerciseIndex = 0; exerciseIndex < draft.exercises.length; exerciseIndex += 1) {
        next[exerciseIndex] = true;
      }
      return next;
    });
  };

  const captureExerciseCardTops = useCallback(() => {
    const beforeTops = new Map<string, number>();
    for (const uiKey of exerciseUiKeys) {
      const element = exerciseCardRefs.current[uiKey];
      if (!element) {
        continue;
      }
      beforeTops.set(uiKey, element.getBoundingClientRect().top);
    }
    return beforeTops;
  }, [exerciseUiKeys]);

  const animateExerciseReorder = useCallback((beforeTops: Map<string, number>) => {
    if (beforeTops.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const durationMs = 220;
    const animated = new Set<HTMLElement>();
    for (const [uiKey, previousTop] of beforeTops.entries()) {
      const element = exerciseCardRefs.current[uiKey];
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
  }, []);

  useEffect(() => {
    const pending = pendingReorderAnimationRef.current;
    if (!pending) {
      return;
    }
    pendingReorderAnimationRef.current = null;
    animateExerciseReorder(pending.beforeTops);
  }, [animateExerciseReorder, exerciseUiKeys]);

  const applyExerciseReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return;
    }

    pendingReorderAnimationRef.current = {
      beforeTops: captureExerciseCardTops()
    };
    setDraft((prev) => reorderExercises(prev, fromIndex, toIndex));
    setExerciseUiKeys((prev) => reorderList(prev, fromIndex, toIndex));
    setCollapsedExercises((prev) => reorderCollapsedExerciseMap(prev, fromIndex, toIndex, draft.exercises.length));
    dragIndexRef.current = toIndex;
    setDragIndex(toIndex);
  }, [captureExerciseCardTops, draft.exercises.length]);

  const getExerciseIndexAtClientY = useCallback((clientY: number) => {
    for (let index = 0; index < draft.exercises.length; index += 1) {
      const uiKey = exerciseUiKeys[index];
      const card = uiKey ? exerciseCardRefs.current[uiKey] : null;
      if (!card) {
        continue;
      }
      const rect = card.getBoundingClientRect();
      const midpointY = rect.top + rect.height / 2;
      if (clientY < midpointY) {
        return index;
      }
    }
    return Math.max(0, draft.exercises.length - 1);
  }, [draft.exercises.length, exerciseUiKeys]);

  const finishPointerExerciseReorder = useCallback(() => {
    pointerDragPointerIdRef.current = null;
    pointerDragExerciseIndexRef.current = null;
    dragIndexRef.current = null;
    setDragIndex(null);
  }, []);

  const handleReverseExerciseOrder = useCallback(() => {
    if (draft.exercises.length < 2) {
      return;
    }
    pendingReorderAnimationRef.current = {
      beforeTops: captureExerciseCardTops()
    };
    setDraft((prev) => reverseExercises(prev));
    setExerciseUiKeys((prev) => reverseList(prev));
    setCollapsedExercises((prev) => reverseCollapsedExerciseMap(prev, draft.exercises.length));
  }, [captureExerciseCardTops, draft.exercises.length]);

  return (
    <section className="space-y-4">

      <Card>
        <CardContent className="space-y-2 pt-2">
          <label className="text-xs text-muted-foreground" htmlFor="workout-name">
            {t("workoutName")}
          </label>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("workoutIcon")}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-background text-sm ring-offset-background transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <WorkoutIconGlyph icon={draft.icon} className={!draft.icon ? "opacity-0" : undefined} />
                  {!draft.icon && <span className="text-muted-foreground">+</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[9.5rem]">
                <div className="grid grid-cols-3 gap-1">
                  <DropdownMenuItem
                    aria-label={t("workoutIconNone")}
                    onSelect={() => setDraft((prev) => ({ ...prev, icon: undefined }))}
                    className={`h-11 w-11 cursor-pointer justify-center rounded-md p-0 ${
                      !draft.icon ? "bg-secondary text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </DropdownMenuItem>
                  {WORKOUT_ICON_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      aria-label={option.label[language]}
                      onSelect={() => setDraft((prev) => ({ ...prev, icon: option.value }))}
                      className={`h-11 w-11 cursor-pointer justify-center rounded-md p-0 ${
                        draft.icon === option.value ? "bg-secondary text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <WorkoutIconGlyph icon={option.value} className="h-4 w-4 text-inherit" />
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              id="workout-name"
              value={draft.name}
              noSelectAll
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("workoutNamePlaceholder")}
              className="min-w-0 flex-1"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold">
          {t("exercises")}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleToggleAllExercisesCollapsed}
            disabled={!hasExercises}
          >
            <ChevronDown className={`h-3 w-3 shrink-0 ${areAllExercisesCollapsed ? "-rotate-90" : ""}`} />
            {areAllExercisesCollapsed ? t("expandAllExercises") : t("collapseAllExercises")}
          </Button>
        </div>
      </div>

      {draft.exercises.map((exercise, exerciseIndex) => {
        const exerciseUiKey = exerciseUiKeys[exerciseIndex] ?? `exercise-fallback-${exerciseIndex}`;
        const collapsed = collapsedExercises[exerciseIndex] ?? false;
        const title = exercise.name.trim() || t("exerciseNew");

        return (
          <Card
            ref={(node) => {
              exerciseCardRefs.current[exerciseUiKey] = node;
            }}
            key={exerciseUiKey}
            onDragOver={(event) => {
              event.preventDefault();
              const currentDragIndex = dragIndexRef.current;
              if (currentDragIndex === null || currentDragIndex === exerciseIndex) {
                return;
              }
              applyExerciseReorder(currentDragIndex, exerciseIndex);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const rawFromData = event.dataTransfer.getData("text/plain");
              const fromData = rawFromData.length ? Number(rawFromData) : Number.NaN;
              const fromIndex = Number.isNaN(fromData) ? dragIndexRef.current : fromData;
              if (fromIndex !== null && !Number.isNaN(fromIndex) && fromIndex !== exerciseIndex) {
                applyExerciseReorder(fromIndex, exerciseIndex);
              }
              dragIndexRef.current = null;
              setDragIndex(null);
            }}
            className={dragIndex === exerciseIndex ? "border-foreground/30" : undefined}
          >
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="flex w-full items-start gap-0.5 text-left"
                    onClick={() =>
                      setCollapsedExercises((prev) => ({
                        ...prev,
                        [exerciseIndex]: !collapsed
                      }))
                    }
                    aria-label={collapsed ? t("expandExercise") : t("collapseExercise")}
                  >
                    <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                    <CardTitle className="min-w-0 flex-1 text-left leading-tight">{title}</CardTitle>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {exercise.x2Enabled && (
                    <span className="rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                      ×2
                    </span>
                  )}
                  <button
                    type="button"
                    draggable={true}
                    onDragStart={(event) => {
                      dragIndexRef.current = exerciseIndex;
                      setDragIndex(exerciseIndex);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(exerciseIndex));
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null;
                      setDragIndex(null);
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse") {
                        return;
                      }
                      event.preventDefault();
                      pointerDragPointerIdRef.current = event.pointerId;
                      pointerDragExerciseIndexRef.current = exerciseIndex;
                      dragIndexRef.current = exerciseIndex;
                      setDragIndex(exerciseIndex);
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (pointerDragPointerIdRef.current !== event.pointerId) {
                        return;
                      }
                      event.preventDefault();
                      const fromIndex = pointerDragExerciseIndexRef.current;
                      if (fromIndex === null) {
                        return;
                      }
                      const targetIndex = getExerciseIndexAtClientY(event.clientY);
                      if (targetIndex === fromIndex) {
                        return;
                      }
                      pointerDragExerciseIndexRef.current = targetIndex;
                      applyExerciseReorder(fromIndex, targetIndex);
                    }}
                    onPointerUp={(event) => {
                      if (pointerDragPointerIdRef.current !== event.pointerId) {
                        return;
                      }
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      finishPointerExerciseReorder();
                    }}
                    onPointerCancel={(event) => {
                      if (pointerDragPointerIdRef.current !== event.pointerId) {
                        return;
                      }
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      finishPointerExerciseReorder();
                    }}
                    onLostPointerCapture={() => {
                      if (pointerDragPointerIdRef.current !== null) {
                        finishPointerExerciseReorder();
                      }
                    }}
                    aria-label={t("reorderExercise")}
                    className="touch-none cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>

            </CardHeader>

            <div className={`grid transition-all duration-200 ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
              <div className="overflow-hidden">
                <CardContent className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("exerciseName")}</label>
                  <Input
                    value={exercise.name}
                    noSelectAll
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((prev) => {
                        const next = structuredClone(prev);
                        const previousName = next.exercises[exerciseIndex].name;
                        next.exercises[exerciseIndex].name = value;
                        if (normalizeExerciseName(previousName) !== normalizeExerciseName(value)) {
                          next.exercises[exerciseIndex].aiInfo = undefined;
                        }
                        return next;
                      });
                    }}
                    placeholder={t("exerciseNamePlaceholder")}
                  />
                  {(() => {
                    const suggestions = getExerciseNameSuggestions(exercise.name, language);
                    if (suggestions.length === 0) {
                      return null;
                    }

                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {suggestions.map((suggestedName) => (
                          <button
                            key={suggestedName}
                            type="button"
                            className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                            onClick={() => {
                              setDraft((prev) => {
                                const next = structuredClone(prev);
                                const currentExercise = next.exercises[exerciseIndex];
                                if (!currentExercise) {
                                  return prev;
                                }
                                currentExercise.name = suggestedName;
                                currentExercise.aiInfo = undefined;
                                return next;
                              });
                            }}
                          >
                            {suggestedName}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t("notes")}</label>
                    <Textarea
                      rows={1}
                      value={exercise.notes ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((prev) => {
                          const next = structuredClone(prev);
                          next.exercises[exerciseIndex].notes = value;
                          return next;
                        });
                      }}
                      placeholder=""
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{t("sets")}</p>
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">−{weightUnitLabel}</span>
                        <Switch
                          checked={exercise.negativeWeightEnabled ?? false}
                          onCheckedChange={(checked) => {
                            setDraft((prev) => {
                              const next = structuredClone(prev);
                              next.exercises[exerciseIndex].negativeWeightEnabled = checked;
                              next.exercises[exerciseIndex].sets = next.exercises[exerciseIndex].sets.map((set) => ({
                                ...set,
                                targetWeight: checked
                                  ? (set.targetWeight > 0 ? -set.targetWeight : set.targetWeight)
                                  : (set.targetWeight < 0 ? -set.targetWeight : set.targetWeight)
                              }));
                              return next;
                            });
                          }}
                          aria-label={t("exerciseNegativeWeightToggle")}
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <span>×2</span>
                        <Switch
                          checked={exercise.x2Enabled ?? false}
                          onCheckedChange={(checked) => {
                            setDraft((prev) => {
                              const next = structuredClone(prev);
                              next.exercises[exerciseIndex].x2Enabled = checked;
                              return next;
                            });
                          }}
                          aria-label={t("exerciseX2Toggle")}
                        />
                      </label>
                    </div>
                  </div>
                  {exercise.sets.map((set, setIndex) => (
                    <div key={`set-${setIndex}`} className="grid grid-cols-[1fr_1fr] items-center gap-2 py-1">
                      <div className="min-w-0">
                        <div className="relative">
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
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                            ×
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        {(() => {
                          const absWeight = Math.abs(set.targetWeight);
                          const isBw = set.targetWeight === 0;
                          const weightKey = `${exerciseIndex}-${setIndex}`;
                          const isFocused = focusedWeightKey === weightKey;
                          const showOverlay = (isBw || exercise.negativeWeightEnabled) && !isFocused;
                          return (
                            <div className="relative">
                              <DecimalInput
                                value={exercise.negativeWeightEnabled ? absWeight : set.targetWeight}
                                min={0}
                                step={0.5}
                                className={`pr-12 ${showOverlay ? "pl-6 text-transparent" : ""}`}
                                onFocus={() => setFocusedWeightKey(weightKey)}
                                onBlur={() => setFocusedWeightKey(null)}
                                onCommit={(value) => {
                                  setDraft((prev) => {
                                    const next = structuredClone(prev);
                                    next.exercises[exerciseIndex].sets[setIndex].targetWeight =
                                      next.exercises[exerciseIndex].negativeWeightEnabled ? -Math.abs(value) : value;
                                    return next;
                                  });
                                }}
                              />
                              {showOverlay && (
                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center gap-0.5 text-sm text-foreground">
                                  <PersonStanding className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  {exercise.negativeWeightEnabled && !isBw && (
                                    <>
                                      <span className="text-muted-foreground">−</span>
                                      <span>{absWeight % 1 === 0 ? absWeight : absWeight.toFixed(1)}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                                {weightUnitLabel}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 border-t pt-2">
                    <ExerciseInfoDialogButton
                      exerciseName={exercise.name.trim() || title}
                      aiInfo={exercise.aiInfo}
                      className="h-8 w-8 rounded-md text-muted-foreground/70"
                    />
                    <div className="flex-1" />
                    <button
                      type="button"
                      disabled={draft.exercises.length <= 1}
                      onClick={() => {
                        const setCount = draft.exercises[exerciseIndex]?.sets.length ?? 0;
                        if (setCount > 1) {
                          setDraft((prev) => {
                            const next = structuredClone(prev);
                            next.exercises[exerciseIndex].sets.pop();
                            return next;
                          });
                          return;
                        }

                        setDeleteExerciseIndex(exerciseIndex);
                      }}
                      aria-label={t("removeExercise")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground disabled:opacity-40"
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
                          const sets = next.exercises[exerciseIndex].sets;
                          const lastSet = sets[sets.length - 1];
                          next.exercises[exerciseIndex].sets.push({
                            targetReps: lastSet?.targetReps ?? 10,
                            targetWeight: lastSet?.targetWeight ?? 10
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
              </div>
            </div>
          </Card>
        );
      })}

      {!isAddExerciseExpanded && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 px-3"
            onClick={() => setIsAddExerciseExpanded(true)}
            aria-label={t("addExercise")}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addExercise")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleReverseExerciseOrder}
            disabled={draft.exercises.length < 2}
            aria-label={t("reverseSessionExerciseOrder")}
            title={t("reverseSessionExerciseOrder")}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isAddExerciseExpanded && (
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
                value={newExerciseName}
                noSelectAll
                onChange={(event) => setNewExerciseName(event.target.value)}
                placeholder={t("exerciseNamePlaceholder")}
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-md text-lg leading-none"
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
                        x2Enabled: false,
                        sets: [
                          { targetReps: 10, targetWeight: 0 },
                          { targetReps: 10, targetWeight: 0 },
                          { targetReps: 10, targetWeight: 0 }
                        ]
                      }
                    ]
                  }));
                  setExerciseUiKeys((prev) => [...prev, createExerciseUiKey()]);
                  setNewExerciseName("");
                  setIsAddExerciseExpanded(false);
                }}
              >
                +
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="h-px bg-border" />

      <div className="space-y-2">
        <Button className="w-full" disabled={!isValid || isSaving || isDeleting || isGeneratingExerciseInfo} onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          {t("save")}
        </Button>
        {mode === "edit" && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={isSaving || isDeleting}
            onClick={handleCancel}
          >
            <X className="mr-2 h-4 w-4" />
            {t("cancel")}
          </Button>
        )}
        {mode === "edit" && (
          <Button
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={isSaving || isDeleting}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("deleteWorkout")}
          </Button>
        )}
      </div>

      <Dialog open={deleteExerciseIndex !== null} onOpenChange={(open) => !open && setDeleteExerciseIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeExercise")}</DialogTitle>
            <DialogDescription>{t("deleteExerciseConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExerciseIndex(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={() => {
                if (deleteExerciseIndex === null) {
                  return;
                }

                setDraft((prev) => {
                  if (prev.exercises.length <= 1 || deleteExerciseIndex >= prev.exercises.length) {
                    return prev;
                  }
                  const next = structuredClone(prev);
                  next.exercises.splice(deleteExerciseIndex, 1);
                  return next;
                });
                setExerciseUiKeys((prev) => {
                  if (deleteExerciseIndex >= prev.length) {
                    return prev;
                  }
                  const next = [...prev];
                  const [removedKey] = next.splice(deleteExerciseIndex, 1);
                  if (removedKey) {
                    delete exerciseCardRefs.current[removedKey];
                  }
                  return next;
                });
                setCollapsedExercises((prev) => {
                  if (deleteExerciseIndex >= draft.exercises.length) {
                    return prev;
                  }
                  const next: Record<number, boolean> = {};
                  for (let index = 0; index < draft.exercises.length; index += 1) {
                    if (index === deleteExerciseIndex) {
                      continue;
                    }
                    const nextIndex = index > deleteExerciseIndex ? index - 1 : index;
                    if (prev[index]) {
                      next[nextIndex] = true;
                    }
                  }
                  return next;
                });
                setDeleteExerciseIndex(null);
              }}
            >
              {t("removeExercise")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
