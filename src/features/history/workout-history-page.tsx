import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronDown, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { WeightInput } from "@/components/weights/weight-input";
import { SetValueDisplay } from "@/components/weights/weight-display";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteCompletedSession,
  getWorkoutById,
  getWorkoutSessionHistory,
  updateCompletedSessionSets,
  type WorkoutSessionHistoryItem
} from "@/db/repository";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { db } from "@/db/db";
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import {
  formatDurationLabel,
  formatNumber,
  getSetRepsValue,
  getSetStatsMultiplier,
  getSetTotalWeight,
  getSetWeightValue,
  normalizeSessionExerciseSet
} from "@/lib/utils";
import { buildWorkoutDataRoute, getWeekStart } from "@/features/statistics/weekly-data-utils";
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  CartesianGrid as RechartsCartesianGrid,
  XAxis as RechartsXAxis
} from "recharts";

type HistoryProgressMetricMode = "sets" | "reps" | "weight";
type HistoryProgressAggregationMode = "sessions" | "weeks";
const HISTORY_CHART_TRANSITION_MS = 360;
const HISTORY_SEGMENTED_CONTROL_CLASS = "inline-flex items-center rounded-lg border bg-background p-0.5";
const HISTORY_SEGMENTED_ITEM_CLASS =
  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const HISTORY_SEGMENTED_ITEM_ACTIVE_CLASS = "bg-foreground text-background";
const HISTORY_SEGMENTED_ITEM_INACTIVE_CLASS = "text-muted-foreground hover:text-foreground";
const HISTORY_STATS_CARD_CLASS =
  "rounded-md border border-emerald-300/50 bg-emerald-100/50 px-2 py-1.5 dark:border-emerald-800/50 dark:bg-emerald-900/25";
const HISTORY_STATS_LABEL_CLASS = "text-[10px] text-emerald-800/80 dark:text-emerald-300/75";
const HISTORY_STATS_VALUE_CLASS = "text-xs font-semibold text-emerald-950/90 dark:text-emerald-100";

interface HistoryChartDatum {
  index: number;
  axisLabel: string;
  fullLabel: string;
  value: number;
}

interface EditableSessionSet {
  id?: number;
  templateExerciseId?: number;
  sessionExerciseKey: string;
  exerciseName: string;
  exerciseNotes?: string;
  exerciseAiInfo?: ExerciseAiInfo;
  exerciseOrder: number;
  isTemplateExercise: boolean;
  templateSetOrder: number;
  x2Enabled: boolean;
  negativeWeightEnabled: boolean;
  actualReps: number;
  actualWeight: number;
  completed: boolean;
}

interface TemplateExerciseMeta {
  aiInfo?: ExerciseAiInfo;
  negativeWeightEnabled: boolean;
}

function normalizeExerciseNameKey(value: string) {
  return value.trim().toLowerCase();
}

function getTemplateExerciseMetaForSet(
  set: Pick<SessionExerciseSet, "templateExerciseId" | "exerciseName">,
  templateExerciseMetaById: Map<number, TemplateExerciseMeta>,
  templateExerciseMetaByName: Map<string, TemplateExerciseMeta>
) {
  if (set.templateExerciseId !== undefined) {
    const byId = templateExerciseMetaById.get(set.templateExerciseId);
    if (byId) {
      return byId;
    }
  }

  const nameKey = normalizeExerciseNameKey(set.exerciseName);
  return nameKey ? templateExerciseMetaByName.get(nameKey) : undefined;
}

function formatHistoryAbsoluteDate(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatHistoryAbsoluteDateWithWeekday(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const locale = language === "de" ? "de-DE" : "en-US";
  const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(/\.$/, "");
  return `${weekdayLabel}, ${formatHistoryAbsoluteDate(date, language)}`;
}

function formatSessionDayOnly(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (dayDiff < 0) {
    return formatHistoryAbsoluteDateWithWeekday(date, language);
  }

  if (dayDiff === 0) return language === "de" ? "Heute" : "Today";
  if (dayDiff === 1) return language === "de" ? "Gestern" : "Yesterday";

  return formatHistoryAbsoluteDateWithWeekday(date, language);
}

function formatHistorySessionDateTime(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  const timeLabel = formatClock(date, language);

  if (dayDiff === 0) return `${language === "de" ? "Heute" : "Today"}, ${timeLabel}`;
  if (dayDiff === 1) return `${language === "de" ? "Gestern" : "Yesterday"}, ${timeLabel}`;

  return `${formatHistoryAbsoluteDateWithWeekday(date, language)}, ${timeLabel}`;
}

function formatHistoryWeekRange(
  weekStart: Date,
  weekEnd: Date,
  language: "de" | "en"
) {
  return `${formatHistoryAbsoluteDate(weekStart, language)} - ${formatHistoryAbsoluteDate(weekEnd, language)}`;
}

function formatClock(value: Date | string, language: "de" | "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalValue(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function WorkoutHistoryContent({
  workoutId,
  sessionHash = "",
  sessionPathKey = "",
  showWorkoutTitle = true,
  headerContent
}: {
  workoutId: number;
  sessionHash?: string;
  sessionPathKey?: string;
  showWorkoutTitle?: boolean;
  headerContent?: ReactNode;
}) {
  const { t, weightUnit, language, weekStartsOn } = useSettings();
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingSets, setEditingSets] = useState<EditableSessionSet[]>([]);
  const [editingSessionStartedAtDraft, setEditingSessionStartedAtDraft] = useState("");
  const [editingSessionFinishedAtDraft, setEditingSessionFinishedAtDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [focusedWeightSetId, setFocusedWeightSetId] = useState<number | null>(null);
  const [collapsedSessions, setCollapsedSessions] = useState<Record<number, boolean>>({});
  const [historyProgressMetricMode, setHistoryProgressMetricMode] = useState<HistoryProgressMetricMode>("sets");
  const [historyProgressAggregationMode, setHistoryProgressAggregationMode] =
    useState<HistoryProgressAggregationMode>("sessions");
  const nextEditingDraftSetIdRef = useRef(-1);
  const autoFocusedSessionHashRef = useRef<string | null>(null);

  const payload = useLiveQuery(async () => {
    if (Number.isNaN(workoutId)) {
      return null;
    }

    const [workout, history] = await Promise.all([
      getWorkoutById(workoutId),
      getWorkoutSessionHistory(workoutId)
    ]);

    return { workout, history };
  }, [workoutId]);
  const settings = useLiveQuery(async () => db.settings.get(1), []);
  const templateExerciseMetaById = useMemo(() => {
    return new Map(
      (payload?.workout?.exercises ?? [])
        .filter((entry): entry is typeof entry & { exercise: typeof entry.exercise & { id: number } } => entry.exercise.id !== undefined)
        .map((entry) => [
          entry.exercise.id,
          {
            aiInfo: entry.exercise.aiInfo,
            negativeWeightEnabled: entry.exercise.negativeWeightEnabled ?? false
          }
        ])
    );
  }, [payload?.workout]);

  const templateExerciseMetaByName = useMemo(() => {
    return new Map(
      (payload?.workout?.exercises ?? []).map((entry) => [
        normalizeExerciseNameKey(entry.exercise.name),
        {
          aiInfo: entry.exercise.aiInfo,
          negativeWeightEnabled: entry.exercise.negativeWeightEnabled ?? false
        }
      ])
    );
  }, [payload?.workout]);

  const groupedHistory = useMemo(() => {
    return (payload?.history ?? []).map((entry) => {
      const normalizedSets = entry.sets.map((set) =>
        normalizeSessionExerciseSet(
          set,
          getTemplateExerciseMetaForSet(set, templateExerciseMetaById, templateExerciseMetaByName)
        )
      );
      const completedSets = normalizedSets.filter((set) => set.completed);
      const grouped = new Map<string, SessionExerciseSet[]>();
      for (const set of completedSets) {
        const list = grouped.get(set.sessionExerciseKey) ?? [];
        list.push(set);
        grouped.set(set.sessionExerciseKey, list);
      }

      const exercises = [...grouped.values()]
        .map((sets) => sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
        .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);

      const setsForExerciseCount = completedSets.length > 0 ? completedSets : normalizedSets;
      const exerciseCount = new Set(setsForExerciseCount.map((set) => set.sessionExerciseKey)).size;
      const setCount = completedSets.reduce((sum, set) => sum + getSetStatsMultiplier(set), 0);
      const repsTotal = completedSets.reduce((sum, set) => sum + getSetRepsValue(set) * getSetStatsMultiplier(set), 0);
      const durationMinutes = getSessionDurationMinutes(entry.session.startedAt, entry.session.finishedAt);
      const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);
      const totalWeight = completedSets.reduce((sum, set) => sum + getSetTotalWeight(set, bodyWeightKg), 0);
      const calories = estimateStrengthTrainingCalories({
        durationMinutes,
        bodyWeightKg,
        completedSetCount: setCount,
        repsTotal
      });

      return {
        ...entry,
        sets: normalizedSets,
        exercises,
        stats: {
          exerciseCount,
          setCount,
          repsTotal,
          totalWeight,
          calories,
          durationMinutes,
          bodyWeightKg,
          usesDefaultBodyWeightForCalories: usesDefaultBodyWeight
        }
      };
    });
  }, [payload?.history, settings?.bodyWeight, templateExerciseMetaById, templateExerciseMetaByName, weightUnit]);

  const progressMetricMeta = useMemo(() => {
    if (historyProgressMetricMode === "reps") {
      return {
        key: "reps" as const,
        label: t("muscleMetricReps"),
        formatValue: (value: number) => formatNumber(value, 0),
        tooltipUnit: t("repsTotal")
      };
    }

    if (historyProgressMetricMode === "weight") {
      return {
        key: "weight" as const,
        label: t("totalWeight"),
        formatValue: (value: number) => `${formatNumber(value, 0)} ${weightUnit}`,
        tooltipUnit: weightUnit
      };
    }

    return {
      key: "sets" as const,
      label: t("sets"),
      formatValue: (value: number) => formatNumber(value, 0),
      tooltipUnit: t("sets")
    };
  }, [historyProgressMetricMode, t, weightUnit]);

  const sessionProgressChartData = useMemo<HistoryChartDatum[]>(() => {
    const locale = language === "de" ? "de-DE" : "en-US";
    const dayFormatter = new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit" });
    const metricKey = progressMetricMeta.key;

    if (historyProgressAggregationMode === "weeks") {
      const groupedByWeek = new Map<
        string,
        {
          weekStart: Date;
          weekEnd: Date;
          sets: number;
          reps: number;
          weight: number;
        }
      >();

      for (const entry of groupedHistory) {
        const completedAt = new Date(entry.session.finishedAt ?? entry.session.startedAt);
        const weekStart = getWeekStart(completedAt, weekStartsOn);
        const weekKey = weekStart.toISOString();
        const current = groupedByWeek.get(weekKey) ?? {
          weekStart,
          weekEnd: new Date(weekStart.getTime() + 6 * 86_400_000),
          sets: 0,
          reps: 0,
          weight: 0
        };

        current.sets += entry.stats.setCount;
        current.reps += entry.stats.repsTotal;
        current.weight += entry.stats.totalWeight;
        groupedByWeek.set(weekKey, current);
      }

      return [...groupedByWeek.values()]
        .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
        .map((entry, index) => ({
          index,
          axisLabel: dayFormatter.format(entry.weekStart),
          fullLabel: formatHistoryWeekRange(entry.weekStart, entry.weekEnd, language),
          value:
            metricKey === "sets"
              ? entry.sets
              : metricKey === "reps"
                ? entry.reps
                : Math.round(entry.weight)
        }));
    }

    return groupedHistory
      .slice()
      .reverse()
      .map((entry, index) => {
        const completedAt = new Date(entry.session.finishedAt ?? entry.session.startedAt);

        return {
          index,
          axisLabel: dayFormatter.format(completedAt),
          fullLabel: formatHistorySessionDateTime(completedAt, language),
          value:
            metricKey === "sets"
              ? entry.stats.setCount
              : metricKey === "reps"
                ? entry.stats.repsTotal
                : Math.round(entry.stats.totalWeight)
        };
      });
  }, [groupedHistory, historyProgressAggregationMode, language, progressMetricMeta.key, weekStartsOn]);

  const sessionProgressChartTicks = useMemo(
    () => sessionProgressChartData.map((entry) => entry.index),
    [sessionProgressChartData]
  );
  const showSessionProgressDots = sessionProgressChartData.length <= 60;

  const sessionProgressConfig = useMemo(
    () =>
      ({
        metric: {
          label: progressMetricMeta.label,
          color: "#10b981"
        }
      }) satisfies ChartConfig,
    [progressMetricMeta.label]
  );

  useEffect(() => {
    setCollapsedSessions((prev) => {
      const next: Record<number, boolean> = {};
      for (const entry of groupedHistory) {
        next[entry.session.id] = prev[entry.session.id] ?? true;
      }
      return next;
    });
  }, [groupedHistory]);

  useEffect(() => {
    if (!sessionHash.startsWith("#session-")) {
      autoFocusedSessionHashRef.current = null;
      return;
    }

    const targetSessionId = Number(sessionHash.replace("#session-", ""));
    if (Number.isNaN(targetSessionId)) {
      return;
    }

    const targetExists = groupedHistory.some((entry) => entry.session.id === targetSessionId);
    if (!targetExists) {
      return;
    }

    const currentTargetHash = `${sessionPathKey}${sessionHash}`;
    if (autoFocusedSessionHashRef.current === currentTargetHash) {
      return;
    }
    autoFocusedSessionHashRef.current = currentTargetHash;

    setCollapsedSessions(() =>
      Object.fromEntries(
        groupedHistory.map((entry) => [entry.session.id, entry.session.id !== targetSessionId])
      )
    );

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`session-${targetSessionId}`)?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [groupedHistory, sessionHash, sessionPathKey]);

  const closeEditDialog = () => {
    setEditingSessionId(null);
    setEditingSets([]);
    setEditingSessionStartedAtDraft("");
    setEditingSessionFinishedAtDraft("");
    nextEditingDraftSetIdRef.current = -1;
  };

  const startEditSession = (entry: WorkoutSessionHistoryItem) => {
    nextEditingDraftSetIdRef.current = -1;

    const editable = entry.sets
      .filter((set): set is typeof set & { id: number } => set.id !== undefined)
      .sort((a, b) => {
        if (a.exerciseOrder !== b.exerciseOrder) return a.exerciseOrder - b.exerciseOrder;
        return a.templateSetOrder - b.templateSetOrder;
      })
      .map((set) => {
        const templateMeta = getTemplateExerciseMetaForSet(set, templateExerciseMetaById, templateExerciseMetaByName);
        return {
          id: set.id,
          templateExerciseId: set.templateExerciseId,
          sessionExerciseKey: set.sessionExerciseKey,
          exerciseName: set.exerciseName,
          exerciseNotes: set.exerciseNotes,
          exerciseAiInfo: set.exerciseAiInfo ?? templateMeta?.aiInfo,
          exerciseOrder: set.exerciseOrder,
          isTemplateExercise: set.isTemplateExercise,
          templateSetOrder: set.templateSetOrder,
          x2Enabled: set.x2Enabled ?? false,
          negativeWeightEnabled: set.negativeWeightEnabled ?? templateMeta?.negativeWeightEnabled ?? false,
          actualReps: set.actualReps ?? set.targetReps,
          actualWeight: set.actualWeight ?? set.targetWeight,
          completed: set.completed
        };
      });

    setEditingSessionId(entry.session.id);
    setEditingSets(editable);
    setEditingSessionStartedAtDraft(toDateTimeLocalValue(entry.session.startedAt));
    setEditingSessionFinishedAtDraft(toDateTimeLocalValue(entry.session.finishedAt ?? entry.session.startedAt));
  };

  const groupedEditingSets = useMemo(() => {
    const grouped = new Map<string, EditableSessionSet[]>();
    for (const set of editingSets) {
      const current = grouped.get(set.sessionExerciseKey) ?? [];
      current.push(set);
      grouped.set(set.sessionExerciseKey, current);
    }

    return [...grouped.values()]
      .map((sets) => sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
      .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);
  }, [editingSets]);

  const addEditingSet = (sessionExerciseKey: string) => {
    setEditingSets((prev) => {
      const exerciseSets = prev
        .filter((set) => set.sessionExerciseKey === sessionExerciseKey)
        .sort((a, b) => a.templateSetOrder - b.templateSetOrder);
      const lastSet = exerciseSets[exerciseSets.length - 1];
      if (!lastSet) {
        return prev;
      }

      const nextTemplateSetOrder = lastSet.templateSetOrder + 1;
      const nextDraftSetId = nextEditingDraftSetIdRef.current;
      nextEditingDraftSetIdRef.current -= 1;

      return [
        ...prev,
        {
          ...lastSet,
          id: nextDraftSetId,
          templateSetOrder: nextTemplateSetOrder,
          actualReps: lastSet.actualReps,
          actualWeight: lastSet.actualWeight,
          completed: false
        }
      ];
    });
  };

  const removeLastEditingSet = (sessionExerciseKey: string) => {
    setEditingSets((prev) => {
      const exerciseSets = prev
        .filter((set) => set.sessionExerciseKey === sessionExerciseKey)
        .sort((a, b) => a.templateSetOrder - b.templateSetOrder);
      const lastSet = exerciseSets[exerciseSets.length - 1];
      if (!lastSet) {
        return prev;
      }

      if (exerciseSets.length <= 1) {
        return prev.filter((set) => set.sessionExerciseKey !== sessionExerciseKey);
      }

      return prev.filter((set) => set.id !== lastSet.id);
    });
  };

  const handleSaveSessionEdit = async () => {
    if (!editingSessionId) return;

    const startedAt = fromDateTimeLocalValue(editingSessionStartedAtDraft);
    const finishedAt = fromDateTimeLocalValue(editingSessionFinishedAtDraft);
    if (!startedAt || !finishedAt || new Date(finishedAt).getTime() < new Date(startedAt).getTime()) {
      toast.error(t("sessionTimeRangeInvalid"));
      return;
    }

    setIsSavingEdit(true);
    try {
      const normalizedEditingSets = groupedEditingSets.flatMap((sets, exerciseIndex) =>
        [...sets]
          .sort((a, b) => a.templateSetOrder - b.templateSetOrder)
          .map((set, templateSetOrder) => ({
            ...set,
            exerciseOrder: exerciseIndex,
            templateSetOrder
          }))
      );

      await updateCompletedSessionSets(
        editingSessionId,
        normalizedEditingSets.map((set) => ({
          id: set.id,
          templateExerciseId: set.templateExerciseId,
          sessionExerciseKey: set.sessionExerciseKey,
          exerciseName: set.exerciseName,
          exerciseNotes: set.exerciseNotes,
          exerciseAiInfo: set.exerciseAiInfo,
          exerciseOrder: set.exerciseOrder,
          isTemplateExercise: set.isTemplateExercise,
          x2Enabled: set.x2Enabled,
          negativeWeightEnabled: set.negativeWeightEnabled,
          templateSetOrder: set.templateSetOrder,
          actualReps: set.actualReps,
          actualWeight: set.actualWeight,
          completed: set.completed
        })),
        { startedAt, finishedAt }
      );
      toast.success(t("sessionUpdated"));
      closeEditDialog();
    } catch {
      toast.error("Action failed");
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (payload === undefined) {
    return null;
  }

  const workoutPayload = payload?.workout;

  if (!workoutPayload) {
    return <p className="text-sm text-muted-foreground">Workout not found.</p>;
  }

  return (
    <section className="space-y-4">
      {(showWorkoutTitle || headerContent) && (
        <div className="space-y-0.5">
          {showWorkoutTitle && (
            <p className="text-base font-semibold leading-tight text-foreground/75">
              <WorkoutNameLabel name={workoutPayload.workout.name} icon={workoutPayload.workout.icon} />
            </p>
          )}
          {headerContent}
        </div>
      )}

      {groupedHistory.length > 0 && (
        <Card className="overflow-hidden border-0 bg-transparent shadow-none">
          <CardHeader className="px-0 py-0 pb-1">
            <div className="flex items-start justify-between gap-3">
              <div className={HISTORY_SEGMENTED_CONTROL_CLASS}>
                {(["weeks", "sessions"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setHistoryProgressAggregationMode(mode)}
                    className={`${HISTORY_SEGMENTED_ITEM_CLASS} ${
                      historyProgressAggregationMode === mode
                        ? HISTORY_SEGMENTED_ITEM_ACTIVE_CLASS
                        : HISTORY_SEGMENTED_ITEM_INACTIVE_CLASS
                    }`}
                    aria-pressed={historyProgressAggregationMode === mode}
                  >
                    {mode === "sessions" ? t("sessions") : t("weeks")}
                  </button>
                ))}
              </div>
              <div className={HISTORY_SEGMENTED_CONTROL_CLASS}>
                {(["sets", "reps", "weight"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setHistoryProgressMetricMode(mode)}
                    className={`${HISTORY_SEGMENTED_ITEM_CLASS} ${
                      historyProgressMetricMode === mode
                        ? HISTORY_SEGMENTED_ITEM_ACTIVE_CLASS
                        : HISTORY_SEGMENTED_ITEM_INACTIVE_CLASS
                    }`}
                    aria-pressed={historyProgressMetricMode === mode}
                  >
                    {mode === "sets" ? t("sets") : mode === "reps" ? t("muscleMetricReps") : t("totalWeight")}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-0">
            <ChartContainer
              config={sessionProgressConfig}
              className="h-52 w-full min-w-0 aspect-auto [&_.recharts-cartesian-grid-horizontal_line]:stroke-border/40"
            >
              <RechartsAreaChart
                accessibilityLayer
                data={sessionProgressChartData}
                margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="session-progress-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-metric)" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="var(--color-metric)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <RechartsCartesianGrid vertical={false} />
                <RechartsXAxis
                  type="number"
                  dataKey="index"
                  domain={sessionProgressChartData.length > 1 ? [0, sessionProgressChartData.length - 1] : [0, 0]}
                  ticks={sessionProgressChartTicks}
                  padding={{ left: 0, right: 0 }}
                  hide
                />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const item = payload?.[0];
                    if (!active || !item?.payload) {
                      return null;
                    }

                    return (
                      <div className="grid min-w-[8rem] items-center justify-items-center gap-0.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-center text-xs shadow-xl">
                        <div className="font-medium leading-tight">{item.payload.fullLabel}</div>
                        <div className="font-medium leading-tight text-foreground">
                          {`${formatNumber(Number(item.value), 0)} ${progressMetricMeta.tooltipUnit}`}
                        </div>
                      </div>
                    );
                  }}
                />
                <RechartsArea
                  type="monotone"
                  dataKey="value"
                  name={progressMetricMeta.label}
                  stroke="var(--color-metric)"
                  strokeWidth={2.5}
                  fill="url(#session-progress-fill)"
                  isAnimationActive
                  animationDuration={HISTORY_CHART_TRANSITION_MS}
                  animationEasing="ease-out"
                  dot={
                    showSessionProgressDots
                      ? {
                          r: 3.5,
                          strokeWidth: 2,
                          stroke: "var(--color-metric)",
                          fill: "hsl(var(--background))"
                        }
                      : false
                  }
                  activeDot={{ r: 4, fill: "var(--color-metric)" }}
                />
              </RechartsAreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {groupedHistory.length === 0 && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">{t("noSessionHistory")}</CardContent>
        </Card>
      )}

      {groupedHistory.map((entry) => {
        const isCollapsed = collapsedSessions[entry.session.id] ?? true;
        return (
        <Card key={entry.session.id} id={`session-${entry.session.id}`} className="scroll-mt-20">
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <button
                  type="button"
                  aria-label={isCollapsed ? t("expandSession") : t("collapseSession")}
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsedSessions((prev) => ({
                      ...prev,
                      [entry.session.id]: !isCollapsed
                    }))
                  }
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                  />
                </button>
                <div className="space-y-1">
                  <CardTitle className="text-sm">
                    {entry.session.finishedAt
                      ? formatSessionDayOnly(entry.session.finishedAt, language)
                      : formatHistorySessionDateTime(entry.session.startedAt, language)}
                  </CardTitle>
                {entry.session.finishedAt && (
                  <p className="text-xs text-muted-foreground">
                    {formatClock(entry.session.startedAt, language)} - {formatClock(entry.session.finishedAt, language)}
                  </p>
                )}
              </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label={t("editSession")} onClick={() => startEditSession(entry)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("deleteSession")}
                  onClick={() => setDeleteSessionId(entry.session.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <div className={`grid transition-all duration-200 ${isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
          <div className="overflow-hidden">
          <CardContent className="space-y-3">
            {entry.exercises.map((sets) => {
              const firstSet = sets[0];
              return (
                <div key={firstSet.sessionExerciseKey} className="space-y-1">
                  <div className="rounded-md border bg-card px-2 py-1.5">
                    <div className="flex min-w-0 items-start gap-1">
                      <div className="inline-flex min-w-0 items-center gap-1 text-xs font-medium leading-tight">
                        <p className="min-w-0 text-left">{firstSet.exerciseName}</p>
                        <ExerciseInfoDialogButton
                          exerciseName={firstSet.exerciseName}
                          aiInfo={
                            firstSet.exerciseAiInfo ??
                            getTemplateExerciseMetaForSet(
                              firstSet,
                              templateExerciseMetaById,
                              templateExerciseMetaByName
                            )?.aiInfo
                          }
                          className="h-[1.25em] w-[1.25em] shrink-0 text-inherit"
                        />
                      </div>
                      {firstSet.x2Enabled && (
                        <span className="rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                          2×
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sets.map((set, index) => {
                        return (
                          <span
                            key={set.id ?? `${firstSet.sessionExerciseKey}-${index}`}
                            className="inline-flex rounded-full border border-border/80 bg-transparent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/70"
                          >
                            <SetValueDisplay
                              reps={getSetRepsValue(set)}
                              weight={getSetWeightValue(set)}
                              weightUnitLabel={weightUnit}
                              iconClassName="text-muted-foreground/70"
                              className="gap-0.5"
                            />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-1.5 border-t pt-2.5 sm:grid-cols-3">
              <div className={HISTORY_STATS_CARD_CLASS}>
                <p className={HISTORY_STATS_LABEL_CLASS}>{t("exercises")}</p>
                <p className={HISTORY_STATS_VALUE_CLASS}>{entry.stats.exerciseCount}</p>
              </div>
              <div className={HISTORY_STATS_CARD_CLASS}>
                <p className={HISTORY_STATS_LABEL_CLASS}>{t("sets")}</p>
                <p className={HISTORY_STATS_VALUE_CLASS}>{entry.stats.setCount}</p>
              </div>
              <div className={HISTORY_STATS_CARD_CLASS}>
                <p className={HISTORY_STATS_LABEL_CLASS}>{t("repsTotal")}</p>
                <p className={HISTORY_STATS_VALUE_CLASS}>{entry.stats.repsTotal}</p>
              </div>
              <div className={HISTORY_STATS_CARD_CLASS}>
                <p className={HISTORY_STATS_LABEL_CLASS}>{t("totalWeight")}</p>
                <p className={HISTORY_STATS_VALUE_CLASS}>{formatNumber(entry.stats.totalWeight, 0)} {weightUnit}</p>
              </div>
              <div className={HISTORY_STATS_CARD_CLASS}>
                <div className="flex items-center justify-between gap-1">
                  <p className={HISTORY_STATS_LABEL_CLASS}>{t("calories")}</p>
                  {entry.stats.usesDefaultBodyWeightForCalories && (
                    <InfoHint
                      ariaLabel={t("calories")}
                      text={t("caloriesEstimateAverageHint")}
                      iconClassName="text-emerald-600 dark:text-emerald-300"
                    />
                  )}
                </div>
                <p className={HISTORY_STATS_VALUE_CLASS}>~{formatNumber(entry.stats.calories, 0)} kcal</p>
              </div>
              <div className={HISTORY_STATS_CARD_CLASS}>
                <p className={HISTORY_STATS_LABEL_CLASS}>{t("duration")}</p>
                <p className={HISTORY_STATS_VALUE_CLASS}>{formatDurationLabel(entry.stats.durationMinutes, language)}</p>
              </div>
            </div>
          </CardContent>
          </div>
          </div>
        </Card>
      )})}

      <Dialog open={editingSessionId !== null} onOpenChange={(nextOpen) => !nextOpen && closeEditDialog()}>
        <DialogContent hideClose className="max-h-[80vh] overflow-y-auto">
          <DialogHeader className="flex-row items-center justify-between space-y-0 pr-0">
            <DialogTitle>{t("editSession")}</DialogTitle>
            <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={isSavingEdit} onClick={() => void handleSaveSessionEdit()}>
              <Save className="h-3.5 w-3.5" />
              {t("save")}
            </Button>
          </DialogHeader>
          <div className="space-y-3">
            <Card>
              <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
                <div className="min-w-0 overflow-hidden space-y-1.5">
                  <Label htmlFor="edit-session-started-at">{t("sessionStartedAt")}</Label>
                  <Input
                    id="edit-session-started-at"
                    type="datetime-local"
                    className="box-border w-full min-w-0 max-w-full text-base sm:text-sm"
                    value={editingSessionStartedAtDraft}
                    onChange={(event) => setEditingSessionStartedAtDraft(event.currentTarget.value)}
                  />
                </div>
                <div className="min-w-0 overflow-hidden space-y-1.5">
                  <Label htmlFor="edit-session-finished-at">{t("sessionEndedAt")}</Label>
                  <Input
                    id="edit-session-finished-at"
                    type="datetime-local"
                    className="box-border w-full min-w-0 max-w-full text-base sm:text-sm"
                    value={editingSessionFinishedAtDraft}
                    onChange={(event) => setEditingSessionFinishedAtDraft(event.currentTarget.value)}
                  />
                </div>
              </CardContent>
            </Card>
            {groupedEditingSets.map((sets) => {
              const firstSet = sets[0];
              return (
                <Card key={firstSet.sessionExerciseKey}>
                  <CardHeader className="pb-2">
                    <div className="flex min-w-0 items-start gap-1">
                      <CardTitle className="inline-flex min-w-0 items-center gap-1 text-left text-base font-semibold leading-tight tracking-normal text-foreground/75">
                        <span className="min-w-0">{firstSet.exerciseName}</span>
                        <ExerciseInfoDialogButton
                          exerciseName={firstSet.exerciseName}
                          aiInfo={firstSet.exerciseAiInfo}
                          className="h-[1.25em] w-[1.25em] shrink-0 text-inherit"
                        />
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sets.map((set) => (
                      <div key={set.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                          <div className="relative">
                            <DecimalInput
                              value={set.actualReps}
                              min={0}
                              step={1}
                              className="pr-10"
                              onCommit={(value) => {
                                setEditingSets((prev) =>
                                  prev.map((item) => (item.id === set.id ? { ...item, actualReps: value } : item))
                                );
                              }}
                            />
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">×</span>
                          </div>
                          {firstSet.x2Enabled && (
                            <span className="pointer-events-none absolute left-1/2 top-0 z-10 inline-flex -translate-x-1/2 -translate-y-[22%] items-center rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
                              2×
                            </span>
                          )}
                          <div className="relative">
                            <WeightInput
                              value={set.actualWeight}
                              negativeWeightEnabled={set.negativeWeightEnabled}
                              weightUnitLabel={weightUnit}
                              focusedSetId={focusedWeightSetId}
                              setId={set.id}
                              onFocusChange={(id) => setFocusedWeightSetId(typeof id === "number" ? id : null)}
                              onCommit={(value) => {
                                setEditingSets((prev) =>
                                  prev.map((item) => (item.id === set.id ? { ...item, actualWeight: value } : item))
                                );
                              }}
                            />
                          </div>
                        </div>
                        <Button
                          variant={set.completed ? "default" : "outline"}
                          size="icon"
                          className="rounded-md"
                          onClick={() => {
                            setEditingSets((prev) =>
                              prev.map((item) => (item.id === set.id ? { ...item, completed: !item.completed } : item))
                            );
                          }}
                          aria-label={t("done")}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-2 border-t pt-2">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                        aria-label={t("removeSet")}
                        onClick={() => removeLastEditingSet(firstSet.sessionExerciseKey)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-md"
                        onClick={() => addEditingSet(firstSet.sessionExerciseKey)}
                        aria-label={t("addSet")}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DialogFooter className="pt-2 sm:pt-3">
            <Button variant="ghost" onClick={closeEditDialog}>{t("cancel")}</Button>
            <Button className="gap-1.5" disabled={isSavingEdit} onClick={() => void handleSaveSessionEdit()}>
              <Save className="h-4 w-4" />
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteSessionId !== null} onOpenChange={(nextOpen) => !nextOpen && setDeleteSessionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteSession")}</DialogTitle>
            <DialogDescription>{t("deleteSessionConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteSessionId(null)}>{t("cancel")}</Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={async () => {
                if (!deleteSessionId) return;
                try {
                  await deleteCompletedSession(deleteSessionId);
                  toast.success(t("sessionDeleted"));
                  setDeleteSessionId(null);
                } catch {
                  toast.error("Action failed");
                }
              }}
            >
              {t("deleteSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function WorkoutHistoryPage() {
  const location = useLocation();
  const { workoutId } = useParams();
  const numericWorkoutId = Number(workoutId);

  if (Number.isNaN(numericWorkoutId)) {
    return <Navigate to="/statistics?period=workout" replace />;
  }

  return <Navigate to={buildWorkoutDataRoute(numericWorkoutId) + location.hash} replace />;
}
