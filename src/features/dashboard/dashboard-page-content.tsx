import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  Clock3,
  Download,
  Dumbbell,
  Flame,
  ListChecks,
  PenSquare,
  Plus,
  Repeat,
  X,
  Sparkles,
  Weight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { InfoHint } from "@/components/ui/info-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { discardSession, ensureDefaultWorkout, startSession } from "@/db/repository";
import { useSettings } from "@/app/settings-context";
import { getSessionDurationMinutes } from "@/lib/calorie-estimation";
import { formatDurationLabel, formatNumber } from "@/lib/utils";
import {
  WeeklyGoalCard,
  WorkoutListCard,
  type WeeklyGoalCardData
} from "@/features/dashboard/dashboard-page-cards";
import {
  useDashboardWorkoutsData,
  useEarliestCompletedPeriodStart,
  useStatisticsPeriodData
} from "@/features/dashboard/use-dashboard-page-data";
import {
  clearLegacyStatisticsWeekParam,
  buildRoundedRadarPath,
  EMPTY_WEEKLY_STATS,
  formatDurationShort,
  formatMuscleMetricValue,
  getMuscleGroupLabel,
  getMuscleMetricValue,
  getStatisticsPeriodStart,
  getStatisticsPeriodEndExclusive,
  MUSCLE_GROUP_ORDER,
  parseMuscleMetricMode,
  parseStatisticsOffset,
  parseStatisticsPeriod,
  parseYearlySessionsMetricMode,
  STATS_MUSCLE_METRIC_SEARCH_PARAM,
  STATS_OFFSET_SEARCH_PARAM,
  STATS_PERIOD_SEARCH_PARAM,
  STATS_YEARLY_SESSIONS_METRIC_SEARCH_PARAM,
  type StatisticsPeriod,
  type MuscleMetricMode,
  type WeeklyStatsWorkoutEntry,
  type YearlySessionsMetricMode
} from "@/features/statistics/weekly-data-utils";

export type DashboardPageSection = "workouts" | "statistics";
const STATS_CHART_TRANSITION_MS = 360;

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function interpolateNumber(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function useAnimatedNumber(targetValue: number, durationMs = STATS_CHART_TRANSITION_MS) {
  const [value, setValue] = useState(targetValue);
  const valueRef = useRef(targetValue);

  useEffect(() => {
    const safeTarget = Number.isFinite(targetValue) ? targetValue : 0;
    const startValue = valueRef.current;

    if (Math.abs(startValue - safeTarget) < 0.001) {
      valueRef.current = safeTarget;
      setValue(safeTarget);
      return;
    }

    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = interpolateNumber(startValue, safeTarget, eased);
      valueRef.current = nextValue;
      setValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [durationMs, targetValue]);

  return value;
}

export function DashboardPageContent({ section }: { section: DashboardPageSection }) {
  const { t, language, weightUnit, restTimerEnabled, restTimerSeconds } = useSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clockTick, setClockTick] = useState(() => Date.now());
  const selectedStatisticsPeriod = useMemo(
    () => parseStatisticsPeriod(searchParams.get(STATS_PERIOD_SEARCH_PARAM)),
    [searchParams]
  );
  const selectedStatisticsOffset = useMemo(
    () =>
      parseStatisticsOffset(
        searchParams.get(STATS_OFFSET_SEARCH_PARAM),
        searchParams.get("week")
      ),
    [searchParams]
  );
  const statisticsPeriod: StatisticsPeriod = section === "statistics" ? selectedStatisticsPeriod : "week";
  const statisticsOffset = section === "statistics" ? selectedStatisticsOffset : 0;
  const currentPeriodStart = useMemo(
    () => getStatisticsPeriodStart(new Date(clockTick), statisticsPeriod),
    [clockTick, statisticsPeriod]
  );
  const periodStart = useMemo(() => {
    if (statisticsOffset === 0) {
      return currentPeriodStart;
    }

    const shifted = new Date(currentPeriodStart);
    if (statisticsPeriod === "month") {
      shifted.setMonth(shifted.getMonth() + statisticsOffset);
    } else if (statisticsPeriod === "year") {
      shifted.setFullYear(shifted.getFullYear() + statisticsOffset);
    } else {
      shifted.setDate(shifted.getDate() + statisticsOffset * 7);
    }
    return getStatisticsPeriodStart(shifted, statisticsPeriod);
  }, [currentPeriodStart, statisticsOffset, statisticsPeriod]);
  const [discardConfirmSessionId, setDiscardConfirmSessionId] = useState<number | null>(null);
  const [isCreatingStarterWorkout, setIsCreatingStarterWorkout] = useState(false);
  const [homeWeeklyGoalKey, setHomeWeeklyGoalKey] = useState<"workouts" | "duration" | "calories" | "weight" | null>(null);
  const [animatedMusclePoints, setAnimatedMusclePoints] = useState<Array<{ x: number; y: number }>>([]);
  const animatedMusclePointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const earliestCompletedPeriodStart = useEarliestCompletedPeriodStart(statisticsPeriod);
  const selectedMuscleMetricMode = useMemo(
    () => parseMuscleMetricMode(searchParams.get(STATS_MUSCLE_METRIC_SEARCH_PARAM)),
    [searchParams]
  );
  const selectedYearlySessionsMetricMode = useMemo(
    () => parseYearlySessionsMetricMode(searchParams.get(STATS_YEARLY_SESSIONS_METRIC_SEARCH_PARAM)),
    [searchParams]
  );
  const muscleMetricMode: MuscleMetricMode = section === "statistics" ? selectedMuscleMetricMode : "reps";
  const yearlySessionsMetricMode: YearlySessionsMetricMode =
    section === "statistics" ? selectedYearlySessionsMetricMode : "duration";

  const updateStatisticsRouteState = useCallback(
    (nextOffset: number) => {
      const normalizedOffset = Number.isInteger(nextOffset) && nextOffset <= 0 ? nextOffset : 0;
      const nextSearchParams = new URLSearchParams(searchParams);

      if (statisticsPeriod === "week") {
        nextSearchParams.delete(STATS_PERIOD_SEARCH_PARAM);
      } else {
        nextSearchParams.set(STATS_PERIOD_SEARCH_PARAM, statisticsPeriod);
      }

      if (normalizedOffset === 0) {
        nextSearchParams.delete(STATS_OFFSET_SEARCH_PARAM);
      } else {
        nextSearchParams.set(STATS_OFFSET_SEARCH_PARAM, String(normalizedOffset));
      }

      clearLegacyStatisticsWeekParam(nextSearchParams);
      setSearchParams(nextSearchParams, { replace: true });
    },
    [searchParams, setSearchParams, statisticsPeriod]
  );

  const updateStatisticsFilterState = useCallback(
    (
      nextFilters: Partial<{
        muscleMetricMode: MuscleMetricMode;
        yearlySessionsMetricMode: YearlySessionsMetricMode;
      }>
    ) => {
      const nextSearchParams = new URLSearchParams(searchParams);

      if (nextFilters.muscleMetricMode) {
        if (nextFilters.muscleMetricMode === "reps") {
          nextSearchParams.delete(STATS_MUSCLE_METRIC_SEARCH_PARAM);
        } else {
          nextSearchParams.set(STATS_MUSCLE_METRIC_SEARCH_PARAM, nextFilters.muscleMetricMode);
        }
      }

      if (nextFilters.yearlySessionsMetricMode) {
        if (nextFilters.yearlySessionsMetricMode === "duration") {
          nextSearchParams.delete(STATS_YEARLY_SESSIONS_METRIC_SEARCH_PARAM);
        } else {
          nextSearchParams.set(STATS_YEARLY_SESSIONS_METRIC_SEARCH_PARAM, nextFilters.yearlySessionsMetricMode);
        }
      }

      clearLegacyStatisticsWeekParam(nextSearchParams);
      setSearchParams(nextSearchParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const earliestStatisticsOffset = useMemo(() => {
    if (!earliestCompletedPeriodStart) {
      return null;
    }
    if (statisticsPeriod === "month") {
      return (
        (earliestCompletedPeriodStart.getFullYear() - currentPeriodStart.getFullYear()) * 12 +
        (earliestCompletedPeriodStart.getMonth() - currentPeriodStart.getMonth())
      );
    }
    if (statisticsPeriod === "year") {
      return earliestCompletedPeriodStart.getFullYear() - currentPeriodStart.getFullYear();
    }
    const diffMs = earliestCompletedPeriodStart.getTime() - currentPeriodStart.getTime();
    return Math.floor(diffMs / (7 * 86_400_000));
  }, [currentPeriodStart, earliestCompletedPeriodStart, statisticsPeriod]);

  useEffect(() => {
    if (section !== "statistics" || earliestStatisticsOffset === null) {
      return;
    }

    if (statisticsOffset < earliestStatisticsOffset) {
      updateStatisticsRouteState(earliestStatisticsOffset);
    }
  }, [earliestStatisticsOffset, section, statisticsOffset, updateStatisticsRouteState]);

  const workouts = useDashboardWorkoutsData({ restTimerEnabled, restTimerSeconds });
  const weeklyStats = useStatisticsPeriodData({ language, weightUnit, period: statisticsPeriod, periodStart });
  const animatedWorkoutCount = useAnimatedNumber(weeklyStats?.workoutCount ?? 0);
  const animatedDurationMinutesTotal = useAnimatedNumber(weeklyStats?.durationMinutesTotal ?? 0);
  const animatedSetCount = useAnimatedNumber(weeklyStats?.setCount ?? 0);
  const animatedRepsTotal = useAnimatedNumber(weeklyStats?.repsTotal ?? 0);
  const animatedTotalWeight = useAnimatedNumber(weeklyStats?.totalWeight ?? 0);
  const animatedCaloriesTotal = useAnimatedNumber(weeklyStats?.caloriesTotal ?? 0);

  const { activeWorkouts, inactiveWorkouts } = useMemo(() => {
    const active = (workouts ?? [])
      .filter((workout) => !!workout.activeSessionId)
      .sort((a, b) => new Date(a.activeSessionStartedAt ?? 0).getTime() - new Date(b.activeSessionStartedAt ?? 0).getTime());

    const inactive = (workouts ?? [])
      .filter((workout) => !workout.activeSessionId)
      .sort((a, b) => {
        if (a.sortTimestamp !== b.sortTimestamp) {
          return a.sortTimestamp - b.sortTimestamp;
        }
        return a.name.localeCompare(b.name);
      });

    return { activeWorkouts: active, inactiveWorkouts: inactive };
  }, [workouts]);

  const hasWorkouts = useMemo(() => (workouts?.length ?? 0) > 0, [workouts]);
  const showWorkoutsSection = section === "workouts";
  const showStatsSection = section === "statistics";
  const hasCompletedWorkoutsForPeriod = (weeklyStats?.completedWorkouts.length ?? 0) > 0;
  const hasActiveWorkout = activeWorkouts.length > 0;
  const hasTrackedWorkoutToday = useMemo(() => {
    const dayStart = new Date(clockTick);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return (weeklyStats?.completedWorkouts ?? []).some((session) => {
      const completedAt = new Date(session.finishedAt ?? session.startedAt);
      return completedAt >= dayStart && completedAt < dayEnd;
    });
  }, [clockTick, weeklyStats?.completedWorkouts]);

  const recommendedWorkoutId = useMemo(() => {
    if (hasActiveWorkout || hasTrackedWorkoutToday) return null;
    return inactiveWorkouts[0]?.id ?? null;
  }, [hasActiveWorkout, hasTrackedWorkoutToday, inactiveWorkouts]);
  const weeklyGoalItems = useMemo(() => {
    if (!weeklyStats) {
      return [];
    }

    const formatWithUnit = (value: number, unitLabel?: string) => {
      const base = formatNumber(value, 0);
      return unitLabel ? `${base} ${unitLabel}` : base;
    };

    const items: WeeklyGoalCardData[] = [];

    if (weeklyStats.weeklyWorkoutCountGoal) {
      const current = weeklyStats.workoutCount;
      const target = weeklyStats.weeklyWorkoutCountGoal;
      items.push({
        key: "workouts",
        label: t("workouts"),
        currentLabel: formatWithUnit(current),
        targetLabel: formatWithUnit(target),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Dumbbell className="h-3.5 w-3.5" />
      });
    }

    if (weeklyStats.weeklyDurationGoal) {
      const current = weeklyStats.durationMinutesTotal;
      const target = weeklyStats.weeklyDurationGoal;
      items.push({
        key: "duration",
        label: t("duration"),
        currentLabel: formatDurationShort(current, language),
        targetLabel: formatDurationShort(target, language),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Clock3 className="h-3.5 w-3.5" />
      });
    }

    if (weeklyStats.weeklyCaloriesGoal) {
      const current = weeklyStats.caloriesTotal ?? 0;
      const target = weeklyStats.weeklyCaloriesGoal;
      items.push({
        key: "calories",
        label: t("calories"),
        currentLabel: formatWithUnit(current, "kcal"),
        targetLabel: formatWithUnit(target, "kcal"),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Flame className="h-3.5 w-3.5" />
      });
    }

    if (weeklyStats.weeklyWeightGoal) {
      const current = weeklyStats.totalWeight;
      const target = weeklyStats.weeklyWeightGoal;
      items.push({
        key: "weight",
        label: t("totalWeight"),
        currentLabel: formatWithUnit(current, weightUnit),
        targetLabel: formatWithUnit(target, weightUnit),
        progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        isComplete: current >= target,
        icon: <Weight className="h-3.5 w-3.5" />
      });
    }

    return items;
  }, [weeklyStats, t, weightUnit, language]);
  const showStatsGoalsSection = showStatsSection && statisticsPeriod === "week" && weeklyGoalItems.length > 0;

  const selectedHomeWeeklyGoal = useMemo(
    () => weeklyGoalItems.find((item) => item.key === homeWeeklyGoalKey) ?? null,
    [homeWeeklyGoalKey, weeklyGoalItems]
  );

  useEffect(() => {
    if (weeklyGoalItems.length === 0) {
      setHomeWeeklyGoalKey(null);
      return;
    }

    setHomeWeeklyGoalKey((current) =>
      current && weeklyGoalItems.some((item) => item.key === current) ? current : weeklyGoalItems[0]?.key ?? null
    );
  }, [weeklyGoalItems]);

  const weeklyMuscleChart = useMemo(() => {
    const metrics = weeklyStats?.muscleGroupMetrics ?? EMPTY_WEEKLY_STATS.muscleGroupMetrics;
    const items = MUSCLE_GROUP_ORDER.map((key) => ({
      key,
      label: getMuscleGroupLabel(t, key),
      value: getMuscleMetricValue(metrics, key, muscleMetricMode)
    }));
    const maxValue = Math.max(0, ...items.map((item) => item.value));
    const totalValue = items.reduce((sum, item) => sum + item.value, 0);
    return { items, maxValue, totalValue };
  }, [weeklyStats?.muscleGroupMetrics, t, muscleMetricMode]);
  const showStatsSessionsSection = showStatsSection && statisticsPeriod === "week" && hasCompletedWorkoutsForPeriod;
  const showStatsMonthCalendarSection = showStatsSection && statisticsPeriod === "month" && hasCompletedWorkoutsForPeriod;
  const showStatsYearSessionsSection = showStatsSection && statisticsPeriod === "year" && hasCompletedWorkoutsForPeriod;
  const showStatsMuscleGroupsSection = showStatsSection && weeklyMuscleChart.totalValue > 0;
  const showStatsContentDivider =
    showStatsMonthCalendarSection || showStatsYearSessionsSection || showStatsSessionsSection || showStatsGoalsSection || showStatsMuscleGroupsSection;

  const weeklySessionsTimeline = useMemo(() => {
    if (statisticsPeriod !== "week") {
      return { dayLabels: [], ticks: [], items: [], nowTick: null };
    }

    const weekStartMs = periodStart.getTime();
    const weekEndMs = getStatisticsPeriodEndExclusive(periodStart, "week").getTime();
    const totalSpanMs = Math.max(1, weekEndMs - weekStartMs);
    const currentWeekStartMs = getStatisticsPeriodStart(new Date(clockTick), "week").getTime();
    const showNowTick = currentWeekStartMs === weekStartMs;
    const nowMs = Math.max(weekStartMs, Math.min(weekEndMs, clockTick));
    const weekdayFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { weekday: "short" });
    const timeFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const dayLabels = Array.from({ length: 7 }).map((_, dayIndex) => {
      const dayDate = new Date(weekStartMs + dayIndex * 86_400_000);
      const raw = weekdayFormatter.format(dayDate).replace(/\.$/, "");
      return {
        key: dayIndex,
        label: raw,
        leftPercent: ((dayIndex + 0.5) / 7) * 100
      };
    });

    const ticks = Array.from({ length: 29 }).map((_, tickIndex) => ({
      key: tickIndex,
      leftPercent: (tickIndex / 28) * 100,
      isDayBoundary: tickIndex % 4 === 0
    }));

    const nowTick = showNowTick
      ? {
          leftPercent: ((nowMs - weekStartMs) / totalSpanMs) * 100
        }
      : null;

    const items = (weeklyStats?.completedWorkouts ?? []).map((item) => {
      const endMs = new Date(item.finishedAt ?? item.startedAt).getTime();
      const clampedEndMs = Math.max(weekStartMs, Math.min(weekEndMs, endMs));
      const rawLeftPercent = ((clampedEndMs - weekStartMs) / totalSpanMs) * 100;
      const clampedPercent = Math.max(0, Math.min(100, rawLeftPercent));
      const anchor: "left" | "right" = clampedPercent <= 5 ? "left" : "right";
      const leftPercent = anchor === "left" ? 0 : clampedPercent;
      const startLabel = timeFormatter.format(new Date(item.startedAt));
      const endLabel = timeFormatter.format(new Date(item.finishedAt ?? item.startedAt));
      const durationMinutes = Math.round(getSessionDurationMinutes(item.startedAt, item.finishedAt ?? item.startedAt));

      return {
        ...item,
        anchor,
        leftPercent,
        shortLabel: item.workoutName.trim(),
        metaLabel: `${Math.max(0, durationMinutes)} min`,
        title: `${item.workoutName} • ${item.weekdayLabel} • ${startLabel}–${endLabel}`
      };
    });

    return { dayLabels, ticks, items, nowTick };
  }, [clockTick, language, periodStart, statisticsPeriod, weeklyStats?.completedWorkouts]);

  const monthlyCalendar = useMemo(() => {
    if (statisticsPeriod !== "month") {
      return null;
    }

    const monthStart = new Date(periodStart);
    const monthEndExclusive = getStatisticsPeriodEndExclusive(monthStart, "month");
    const lastMonthDay = new Date(monthEndExclusive);
    lastMonthDay.setDate(lastMonthDay.getDate() - 1);
    const gridStart = getStatisticsPeriodStart(monthStart, "week");
    const gridEndExclusive = getStatisticsPeriodEndExclusive(getStatisticsPeriodStart(lastMonthDay, "week"), "week");

    const sessionsByDay = new Map<
      string,
      Array<{
        sessionId: number;
        workoutId: number;
        workoutName: string;
        workoutIcon?: WeeklyStatsWorkoutEntry["workoutIcon"];
      }>
    >();
    for (const workout of weeklyStats?.completedWorkouts ?? []) {
      const completedAt = new Date(workout.finishedAt ?? workout.startedAt);
      const key = formatLocalDateKey(completedAt);
      const current = sessionsByDay.get(key) ?? [];
      current.push({
        sessionId: workout.sessionId,
        workoutId: workout.workoutId,
        workoutName: workout.workoutName,
        workoutIcon: workout.workoutIcon
      });
      sessionsByDay.set(key, current);
    }

    const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
      const labelDate = new Date(2024, 0, 1 + index);
      return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { weekday: "short" })
        .format(labelDate)
        .replace(/\.$/, "");
    });

    const days: Array<{
      key: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      sessions: Array<{
        sessionId: number;
        workoutId: number;
        workoutName: string;
        workoutIcon?: WeeklyStatsWorkoutEntry["workoutIcon"];
      }>;
      sessionCount: number;
    }> = [];

    for (const cursor = new Date(gridStart); cursor < gridEndExclusive; cursor.setDate(cursor.getDate() + 1)) {
      const day = new Date(cursor);
      const key = formatLocalDateKey(day);
      const today = new Date(clockTick);
      today.setHours(0, 0, 0, 0);
      day.setHours(0, 0, 0, 0);

      days.push({
        key,
        dayNumber: day.getDate(),
        isCurrentMonth: day.getMonth() === monthStart.getMonth() && day.getFullYear() === monthStart.getFullYear(),
        isToday: day.getTime() === today.getTime(),
        sessions: sessionsByDay.get(key) ?? [],
        sessionCount: (sessionsByDay.get(key) ?? []).length
      });
    }

    return { weekdayLabels, days };
  }, [clockTick, language, periodStart, statisticsPeriod, weeklyStats?.completedWorkouts]);

  const yearlySessionsChart = useMemo(() => {
    if (statisticsPeriod !== "year") {
      return null;
    }

    const yearStart = new Date(periodStart);
    const yearEndExclusive = getStatisticsPeriodEndExclusive(yearStart, "year");
    const chartStart = getStatisticsPeriodStart(yearStart, "week");
    const lastYearDay = new Date(yearEndExclusive);
    lastYearDay.setDate(lastYearDay.getDate() - 1);
    const chartEndExclusive = getStatisticsPeriodEndExclusive(getStatisticsPeriodStart(lastYearDay, "week"), "week");

    const durationByWeekKey = new Map<string, number>();
    for (const workout of weeklyStats?.completedWorkouts ?? []) {
      const completedAt = new Date(workout.finishedAt ?? workout.startedAt);
      const weekStart = getStatisticsPeriodStart(completedAt, "week");
      const weekKey = formatLocalDateKey(weekStart);
      const current = durationByWeekKey.get(weekKey) ?? 0;
      const nextValue =
        yearlySessionsMetricMode === "workouts"
          ? current + 1
          : yearlySessionsMetricMode === "sets"
            ? current + workout.setCount
            : current + workout.durationMinutes;
      durationByWeekKey.set(weekKey, nextValue);
    }

    const bars: Array<{
      index: number;
      key: string;
      durationMinutes: number;
      heightPercent: number;
      title: string;
      monthLabel: string;
      monthIndex: number;
    }> = [];
    let maxDurationMinutes = 0;
    const monthFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { month: "short" });

    let barIndex = 0;
    for (const cursor = new Date(chartStart); cursor < chartEndExclusive; cursor.setDate(cursor.getDate() + 7)) {
      const weekStart = new Date(cursor);
      const weekKey = formatLocalDateKey(weekStart);
      const durationMinutes = durationByWeekKey.get(weekKey) ?? 0;
      maxDurationMinutes = Math.max(maxDurationMinutes, durationMinutes);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const representativeDate = new Date(Math.max(weekStart.getTime(), yearStart.getTime()));
      const monthIndex = representativeDate.getMonth();
      bars.push({
        index: barIndex,
        key: weekKey,
        durationMinutes,
        heightPercent: 0,
        monthLabel: monthFormatter.format(representativeDate).replace(/\.$/, ""),
        monthIndex,
        title: `${weekStart.toLocaleDateString(language === "de" ? "de-DE" : "en-US")} – ${weekEnd.toLocaleDateString(
          language === "de" ? "de-DE" : "en-US"
        )}: ${
          yearlySessionsMetricMode === "workouts"
            ? `${durationMinutes} ${t("workouts")}`
            : yearlySessionsMetricMode === "sets"
              ? `${durationMinutes} ${t("sets")}`
              : formatDurationShort(durationMinutes, language)
        }`
      });
      barIndex += 1;
    }

    const maxValue = Math.max(maxDurationMinutes, 1);
    return bars.map((bar) => ({
      ...bar,
      heightPercent: bar.durationMinutes > 0 ? Math.max(10, (bar.durationMinutes / maxValue) * 100) : 0
    }));
  }, [language, periodStart, statisticsPeriod, t, weeklyStats?.completedWorkouts, yearlySessionsMetricMode]);

  const yearlySessionsMonthAxis = useMemo(() => {
    if (!yearlySessionsChart || yearlySessionsChart.length === 0) {
      return [];
    }

    const segments: Array<{ key: string; label: string; startIndex: number; span: number }> = [];
    let currentSegment: { key: string; label: string; startIndex: number; span: number } | null = null;

    for (const bar of yearlySessionsChart) {
      const segmentKey = `${bar.monthIndex}-${bar.monthLabel}`;
      if (!currentSegment || currentSegment.key !== segmentKey) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          key: segmentKey,
          label: bar.monthLabel,
          startIndex: bar.index,
          span: 1
        };
      } else {
        currentSegment.span += 1;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }, [yearlySessionsChart]);

  const muscleChartTargetPoints = useMemo(() => {
    return weeklyMuscleChart.items.map((item, index) => {
      const angle = (-120 + index * 60) * (Math.PI / 180);
      const ratio = weeklyMuscleChart.maxValue > 0 ? item.value / weeklyMuscleChart.maxValue : 0;
      const radius = 28 + ratio * 88;
      const x = 180 + Math.cos(angle) * radius;
      const y = 180 + Math.sin(angle) * radius;
      return { x, y };
    });
  }, [weeklyMuscleChart]);

  useEffect(() => {
    if (muscleChartTargetPoints.length === 0) {
      setAnimatedMusclePoints([]);
      animatedMusclePointsRef.current = [];
      return;
    }

    const startPoints =
      animatedMusclePointsRef.current.length === muscleChartTargetPoints.length
        ? animatedMusclePointsRef.current
        : muscleChartTargetPoints;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / STATS_CHART_TRANSITION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const nextPoints = muscleChartTargetPoints.map((targetPoint, index) => {
        const sourcePoint = startPoints[index] ?? targetPoint;
        return {
          x: interpolateNumber(sourcePoint.x, targetPoint.x, eased),
          y: interpolateNumber(sourcePoint.y, targetPoint.y, eased)
        };
      });
      animatedMusclePointsRef.current = nextPoints;
      setAnimatedMusclePoints(nextPoints);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [muscleChartTargetPoints]);

  const handleStartSession = async (workoutId: number) => {
    try {
      const sessionId = await startSession(workoutId);
      navigate(`/sessions/${sessionId}`);
    } catch {
      toast.error("Session start failed");
    }
  };

  const handleDiscardConfirmed = async () => {
    if (!discardConfirmSessionId) return;
    try {
      await discardSession(discardConfirmSessionId);
      toast.success(t("sessionDiscarded"));
    } catch {
      toast.error("Action failed");
    } finally {
      setDiscardConfirmSessionId(null);
    }
  };

  const handleUseStarterWorkout = async () => {
    try {
      setIsCreatingStarterWorkout(true);
      await ensureDefaultWorkout();
      toast.success(t("workoutCreated"));
    } catch {
      toast.error("Action failed");
    } finally {
      setIsCreatingStarterWorkout(false);
    }
  };

  return (
    <section className="space-y-4">
      {showWorkoutsSection && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold leading-tight text-foreground/75">{t("workoutsSubtitle")}</p>
          {hasWorkouts && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("/workouts/add")}
            >
              <Plus className="h-4 w-4" />
              {t("add")}
            </Button>
          )}
        </div>
      )}

      {showWorkoutsSection && !hasWorkouts && (
        <>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>{t("dashboardIntroTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("dashboardIntroDescription")}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="secondary"
              className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
              disabled={isCreatingStarterWorkout}
              onClick={() => void handleUseStarterWorkout()}
            >
              <Dumbbell className="h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start">
                <span>{t("useStarterWorkout")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("useStarterWorkoutHint")}</span>
              </span>
            </Button>
            <Button
              variant="secondary"
              className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
              onClick={() => navigate("/workouts/new")}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start">
                <span>{t("createWorkout")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("createWorkoutHint")}</span>
              </span>
            </Button>
            <Button
              variant="secondary"
              className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
              onClick={() => navigate("/import")}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start">
                <span>{t("aiGenerate")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("aiImportEntryHint")}</span>
              </span>
            </Button>
          </CardContent>
        </Card>
        <div className="border-t p-4">
          <p className="mb-2 text-xs text-muted-foreground">{t("dashboardImportExistingDataHint")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => navigate("/settings#data-import")}
          >
            <Download className="h-4 w-4" />
            {t("dashboardImportExistingData")}
          </Button>
        </div>
        </>
      )}

      {showWorkoutsSection && activeWorkouts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t("activeSession")}</p>
          {activeWorkouts.map((workout) => (
            <WorkoutListCard
              key={workout.id}
              workout={workout}
              hasActiveWorkout={hasActiveWorkout}
              recommendedWorkoutId={recommendedWorkoutId}
              language={language}
              t={t}
              onOpenHistory={(workoutId) => navigate(`/workouts/${workoutId}/history`)}
              onEditWorkout={(workoutId) => navigate(`/workouts/${workoutId}/edit`)}
              onDiscardActiveSession={(sessionId) => setDiscardConfirmSessionId(sessionId)}
              onStartOrResume={handleStartSession}
            />
          ))}
        </div>
      )}

      {showWorkoutsSection && activeWorkouts.length > 0 && inactiveWorkouts.length > 0 && <div className="h-px bg-border" />}

      {showWorkoutsSection && inactiveWorkouts.length > 0 && (
        <div className="space-y-3">
          {activeWorkouts.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">{t("otherWorkouts")}</p>
          )}
          {inactiveWorkouts.map((workout) => (
            <WorkoutListCard
              key={workout.id}
              workout={workout}
              hasActiveWorkout={hasActiveWorkout}
              recommendedWorkoutId={recommendedWorkoutId}
              language={language}
              t={t}
              onOpenHistory={(workoutId) => navigate(`/workouts/${workoutId}/history`)}
              onEditWorkout={(workoutId) => navigate(`/workouts/${workoutId}/edit`)}
              onDiscardActiveSession={(sessionId) => setDiscardConfirmSessionId(sessionId)}
              onStartOrResume={handleStartSession}
            />
          ))}
        </div>
      )}

      {showWorkoutsSection && selectedHomeWeeklyGoal && (
        <>
          {showStatsContentDivider && (
            <div className="py-1.5">
              <div className="h-px bg-border" />
            </div>
          )}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold leading-tight text-foreground/75">{t("myWeeklyGoal")}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs">
                    <span className="max-w-[8.5rem] truncate">{selectedHomeWeeklyGoal.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuRadioGroup
                    value={homeWeeklyGoalKey ?? selectedHomeWeeklyGoal.key}
                    onValueChange={(value) =>
                      setHomeWeeklyGoalKey(value as "workouts" | "duration" | "calories" | "weight")
                    }
                  >
                    {weeklyGoalItems.map((goal) => (
                      <DropdownMenuRadioItem key={`home-goal-${goal.key}`} value={goal.key}>
                        {goal.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <WeeklyGoalCard goal={selectedHomeWeeklyGoal} compact />
          </section>
        </>
      )}

      {showStatsSection && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-100/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <p className="inline-flex items-center gap-1 text-xs text-emerald-700/90 dark:text-emerald-300/75">
                <Dumbbell className="h-3.5 w-3.5" />
                {t("workoutsThisWeek")}
              </p>
              <p className="text-base font-semibold text-emerald-950 dark:text-emerald-100">{Math.round(animatedWorkoutCount)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-100/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <p className="inline-flex items-center gap-1 text-xs text-emerald-700/90 dark:text-emerald-300/75">
                <Clock3 className="h-3.5 w-3.5" />
                {t("duration")}
              </p>
              <p className="text-base font-semibold text-emerald-950 dark:text-emerald-100">{formatDurationLabel(animatedDurationMinutesTotal, language)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-100/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <p className="inline-flex items-center gap-1 text-xs text-emerald-700/90 dark:text-emerald-300/75">
                <ListChecks className="h-3.5 w-3.5" />
                {t("sets")}
              </p>
              <p className="text-base font-semibold text-emerald-950 dark:text-emerald-100">{Math.round(animatedSetCount)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-100/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <p className="inline-flex items-center gap-1 text-xs text-emerald-700/90 dark:text-emerald-300/75">
                <Repeat className="h-3.5 w-3.5" />
                {t("repsTotal")}
              </p>
              <p className="text-base font-semibold text-emerald-950 dark:text-emerald-100">{Math.round(animatedRepsTotal)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-100/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <p className="inline-flex items-center gap-1 text-xs text-emerald-700/90 dark:text-emerald-300/75">
                <Weight className="h-3.5 w-3.5" />
                {t("totalWeight")}
              </p>
              <p className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
                {formatNumber(animatedTotalWeight, 0)} {weightUnit}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-100/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <div className="flex items-center justify-between gap-1">
                <p className="inline-flex items-center gap-1 text-xs text-emerald-700/90 dark:text-emerald-300/75">
                  <Flame className="h-3.5 w-3.5" />
                  {t("calories")}
                </p>
                {weeklyStats?.usesDefaultBodyWeightForCalories && (
                  <InfoHint
                    ariaLabel={t("calories")}
                    text={t("caloriesEstimateAverageHint")}
                    iconClassName="text-emerald-600 dark:text-emerald-300"
                  />
                )}
              </div>
              <p className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
                ~{formatNumber(animatedCaloriesTotal, 0)} kcal
              </p>
            </div>
          </div>

          {showStatsContentDivider && (
            <div className="py-1.5">
              <div className="h-px bg-border" />
            </div>
          )}

          {showStatsMonthCalendarSection && monthlyCalendar && (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                    {t("sessions")}
                  </p>
                </div>
                <div className="grid grid-cols-7">
                  {monthlyCalendar.weekdayLabels.map((label) => (
                    <div
                      key={`month-weekday-${label}`}
                      className="flex h-5 items-center justify-center border-b border-border/90 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70"
                    >
                      {label}
                    </div>
                  ))}
                  {monthlyCalendar.days.map((day, index) => {
                    const isLastColumn = index % 7 === 6;
                    const isLastRow = index >= monthlyCalendar.days.length - 7;
                    const isFirstColumn = index % 7 === 0;
                    const isFirstRow = index < 7;
                    const nextDay = isLastColumn ? null : monthlyCalendar.days[index + 1] ?? null;
                    const nextRowDay = isLastRow ? null : monthlyCalendar.days[index + 7] ?? null;
                    const showLeftBorder = !isFirstColumn;
                    const showTopBorder = !isFirstRow;
                    const showRightBorder = !isLastColumn && !nextDay?.isCurrentMonth;
                    const showBottomBorder = !isLastRow && !nextRowDay?.isCurrentMonth;
                    return (
                      <div
                        key={day.key}
                        className="relative flex h-8 items-center justify-center"
                      >
                        {day.isCurrentMonth ? (
                          <>
                            <div
                              className={`pointer-events-none absolute inset-0 ${showTopBorder ? "border-t" : ""} ${
                                showLeftBorder ? "border-l" : ""
                              } ${showRightBorder ? "border-r" : ""} ${showBottomBorder ? "border-b" : ""} border-border/90`}
                              aria-hidden="true"
                            />
                            <span className="pointer-events-none absolute left-1 top-1 text-[9px] font-medium leading-none text-muted-foreground/70">
                              {day.dayNumber}
                            </span>
                            {day.sessionCount > 0 ? (
                              <div className="mt-0.5 inline-flex items-center justify-center gap-1">
                                <div
                                  className="relative h-5"
                                  style={{
                                    width: `${16 + Math.max(0, Math.min(day.sessionCount, 3) - 1) * 6}px`
                                  }}
                                >
                                  {day.sessions.slice(0, 3).map((session, sessionIndex) => (
                                    <Link
                                      key={`month-session-${session.sessionId}`}
                                      to={`/workouts/${session.workoutId}/history#session-${session.sessionId}`}
                                      title={session.workoutName}
                                      aria-label={session.workoutName}
                                      className="absolute top-1/2 inline-flex h-4 w-4 -translate-y-1/2 rounded-full border border-emerald-500/70 bg-emerald-300/70 transition-colors hover:bg-emerald-300/90 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30"
                                      style={{
                                        left: `${sessionIndex * 6}px`,
                                        zIndex: 3 - sessionIndex
                                      }}
                                    />
                                  ))}
                                </div>
                                {day.sessionCount > 3 ? (
                                  <span
                                    className="inline-flex h-5 items-center justify-center px-0.5 text-[11px] font-semibold leading-none text-muted-foreground/80"
                                    aria-label={`${day.sessionCount} ${t("sessions")}`}
                                  >
                                    +
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
              <div className="py-1.5">
                <div className="h-px bg-border" />
              </div>
            </>
          )}

          {showStatsYearSessionsSection && yearlySessionsChart && (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                    {t("sessions")}
                  </p>
                  <div className="inline-flex items-center rounded-lg border bg-background p-0.5">
                    {(["workouts", "duration", "sets"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateStatisticsFilterState({ yearlySessionsMetricMode: mode })}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          yearlySessionsMetricMode === mode
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={yearlySessionsMetricMode === mode}
                      >
                        {mode === "workouts" ? t("workouts") : mode === "duration" ? t("duration") : t("sets")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex h-36 items-end gap-0.5 border-b border-border/90 pb-0.5">
                    {yearlySessionsChart.map((bar) => (
                      <div key={bar.index} className="flex h-full min-w-0 flex-1 items-end justify-center">
                        <div
                          className={`w-full min-w-[5px] rounded-t-[6px] border border-b-0 border-emerald-500/65 bg-gradient-to-t from-emerald-500/0 via-emerald-500/25 to-emerald-500/85 transition-[height] duration-[360ms] ease-out ${
                            bar.durationMinutes === 0 ? "border-emerald-500/20 from-transparent via-transparent to-transparent opacity-45" : ""
                          }`}
                          style={{ height: `${bar.heightPercent}%` }}
                          title={bar.title}
                          aria-label={bar.title}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    className="grid items-start"
                    style={{ gridTemplateColumns: `repeat(${yearlySessionsChart.length}, minmax(0, 1fr))` }}
                  >
                    {yearlySessionsMonthAxis.map((segment) => (
                      <div
                        key={segment.key}
                        className="flex justify-center"
                        style={{ gridColumn: `${segment.startIndex + 1} / span ${segment.span}` }}
                      >
                        <span className="text-[10px] font-medium leading-none text-muted-foreground/55">
                          {segment.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <div className="py-1.5">
                <div className="h-px bg-border" />
              </div>
            </>
          )}

          {showStatsSessionsSection && (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                    {t("sessions")}
                  </p>
                </div>
                <div className="relative h-34 px-1 pt-4">
                  <div className="relative h-28">
                    <div className="absolute inset-x-0 bottom-3 h-px bg-border" />

                    {weeklySessionsTimeline.ticks.map((tick) => (
                      <div
                        key={`session-tick-${tick.key}`}
                        className="absolute bottom-3 -translate-x-1/2"
                        style={{ left: `${tick.leftPercent}%` }}
                        aria-hidden="true"
                      >
                        <div className={`w-px bg-border ${tick.isDayBoundary ? "h-3.5" : "h-[7px] opacity-80"}`} />
                      </div>
                    ))}

                    {weeklySessionsTimeline.nowTick && (
                      <div
                        className="absolute bottom-3 -translate-x-1/2"
                        style={{ left: `${weeklySessionsTimeline.nowTick.leftPercent}%` }}
                        aria-hidden="true"
                      >
                        <div className="w-[2px] h-5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                      </div>
                    )}

                    {weeklySessionsTimeline.items.map((item) => (
                      <Link
                        key={item.sessionId}
                        to={`/workouts/${item.workoutId}/history#session-${item.sessionId}`}
                        title={item.title}
                        className="group absolute bottom-4"
                        style={{
                          left: `${item.leftPercent}%`,
                          transform: item.anchor === "left" ? "translateX(0)" : "translateX(-100%)"
                        }}
                      >
                        <div className="relative inline-flex h-[6rem] w-[2rem] items-center justify-center rounded-md border bg-card px-3 py-3 shadow-sm transition-colors group-hover:bg-secondary">
                          <div className="absolute left-1/2 top-1/2 w-[5rem] -translate-x-1/2 -translate-y-1/2 -rotate-90 overflow-hidden">
                            <span className="block truncate text-center font-sans text-[12px] font-medium leading-none text-foreground">
                              {item.shortLabel}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  <div className="relative -mt-1 h-3">
                    {weeklySessionsTimeline.dayLabels.map((day) => (
                      <div
                        key={`session-day-${day.key}`}
                        className="absolute top-0 -translate-x-1/2 text-[10px] font-medium leading-none text-muted-foreground"
                        style={{ left: `${day.leftPercent}%` }}
                      >
                        {day.label}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <div className="py-1.5">
                <div className="h-px bg-border" />
              </div>
            </>
          )}

          {showStatsGoalsSection && (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                    {t("weeklyGoals")}
                  </p>
                  <Button asChild variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs">
                    <Link to="/settings#weekly-goals">
                      <PenSquare className="h-3 w-3" />
                      {t("edit")}
                    </Link>
                  </Button>
                </div>
                <div className="space-y-2">
                  {weeklyGoalItems.map((goal) => (
                    <WeeklyGoalCard key={`goal-${goal.key}`} goal={goal} />
                  ))}
                </div>
              </section>
              <div className="py-3">
                <div className="h-px bg-border" />
              </div>
            </>
          )}

          {showStatsMuscleGroupsSection && (
            <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                {t("muscleGroupsThisWeek")}
              </p>
              <div className="inline-flex items-center rounded-lg border bg-background p-0.5">
                {(["sets", "reps", "weight"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateStatisticsFilterState({ muscleMetricMode: mode })}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      muscleMetricMode === mode
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={muscleMetricMode === mode}
                  >
                    {mode === "reps" ? t("muscleMetricReps") : mode === "sets" ? t("muscleMetricSets") : t("muscleMetricWeight")}
                  </button>
                ))}
              </div>
            </div>

            <Card>
              <CardContent className="space-y-0 px-4 py-0">
                <div className="mx-auto w-full max-w-[420px]">
                  <svg viewBox="0 0 360 360" className="block h-auto w-full" role="img" aria-label={t("muscleGroupsThisWeek")}>
                        {Array.from({ length: 5 }).map((_, ringIndex) => {
                          const radius = 28 + ringIndex * 22;
                          return (
                            <circle
                              key={`ring-${radius}`}
                              cx="180"
                              cy="180"
                              r={radius}
                              fill="none"
                              stroke="currentColor"
                              className="text-border/70"
                              strokeWidth="1"
                            />
                          );
                        })}

                        {weeklyMuscleChart.items.map((item, index) => {
                          const angle = (-120 + index * 60) * (Math.PI / 180);
                          const axisX = 180 + Math.cos(angle) * 116;
                          const axisY = 180 + Math.sin(angle) * 116;
                          const labelX = 180 + Math.cos(angle) * 148;
                          const labelY = 180 + Math.sin(angle) * 148;
                          const valueY = labelY + (Math.sin(angle) > 0.3 ? 14 : Math.sin(angle) < -0.3 ? 16 : 14);

                          return (
                            <g key={`axis-${item.key}`}>
                              <line
                                x1="180"
                                y1="180"
                                x2={axisX}
                                y2={axisY}
                                stroke="currentColor"
                                className="text-border"
                                strokeWidth="1"
                              />
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                className="fill-foreground text-xs font-medium"
                              >
                                {item.label}
                              </text>
                              <text
                                x={labelX}
                                y={valueY}
                                textAnchor="middle"
                                className="fill-muted-foreground text-xs"
                              >
                                {muscleMetricMode === "weight"
                                  ? `${formatMuscleMetricValue(item.value, muscleMetricMode)} ${weightUnit}`
                                  : formatMuscleMetricValue(item.value, muscleMetricMode)}
                              </text>
                            </g>
                          );
                        })}

                        {(() => {
                          const points = animatedMusclePoints.length === weeklyMuscleChart.items.length
                            ? animatedMusclePoints
                            : muscleChartTargetPoints;
                          const path = buildRoundedRadarPath(points, 2.5);

                          return (
                            <>
                              <path
                                d={path}
                                fill="currentColor"
                                className="text-emerald-500/15 dark:text-emerald-400/15"
                                stroke="none"
                              />
                              <path
                                d={path}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-emerald-500 dark:text-emerald-400"
                              />
                            </>
                          );
                        })()}
                  </svg>
                </div>
              </CardContent>
            </Card>
            </section>
          )}
        </section>
      )}

      <Dialog open={discardConfirmSessionId !== null} onOpenChange={(open) => !open && setDiscardConfirmSessionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discardSession")}</DialogTitle>
            <DialogDescription>{t("discardSessionConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardConfirmSessionId(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={() => void handleDiscardConfirmed()}
            >
              <X className="mr-2 h-4 w-4" />
              {t("discardSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
