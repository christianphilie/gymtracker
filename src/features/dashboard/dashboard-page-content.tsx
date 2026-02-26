import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { formatNumber, formatSessionDateLabel } from "@/lib/utils";
import {
  WeeklyGoalCard,
  WorkoutListCard,
  type WeeklyGoalCardData
} from "@/features/dashboard/dashboard-page-cards";
import {
  useDashboardWorkoutsData,
  useWeeklyStatsData
} from "@/features/dashboard/use-dashboard-page-data";
import {
  buildRoundedRadarPath,
  EMPTY_WEEKLY_STATS,
  formatDurationShort,
  formatMuscleMetricValue,
  getMuscleGroupLabel,
  getMuscleMetricValue,
  getWeekEndExclusive,
  getWeekStart,
  MUSCLE_GROUP_ORDER,
  type MuscleMetricMode
} from "@/features/statistics/weekly-data-utils";

export type DashboardPageSection = "workouts" | "statistics";

export function DashboardPageContent({ section }: { section: DashboardPageSection }) {
  const { t, language, weightUnit, restTimerEnabled, restTimerSeconds } = useSettings();
  const navigate = useNavigate();
  const [clockTick, setClockTick] = useState(() => Date.now());
  const weekStart = useMemo(() => getWeekStart(new Date(clockTick)), [clockTick]);
  const [discardConfirmSessionId, setDiscardConfirmSessionId] = useState<number | null>(null);
  const [isCreatingStarterWorkout, setIsCreatingStarterWorkout] = useState(false);
  const [muscleMetricMode, setMuscleMetricMode] = useState<MuscleMetricMode>("reps");
  const [homeWeeklyGoalKey, setHomeWeeklyGoalKey] = useState<"workouts" | "duration" | "calories" | "weight" | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const workouts = useDashboardWorkoutsData({ restTimerEnabled, restTimerSeconds });
  const weeklyStats = useWeeklyStatsData({ language, weightUnit, weekStart });

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

  const weeklySessionsTimeline = useMemo(() => {
    const weekStartMs = weekStart.getTime();
    const weekEndMs = getWeekEndExclusive(weekStart).getTime();
    const totalSpanMs = Math.max(1, weekEndMs - weekStartMs);
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

    const nowTick = {
      leftPercent: ((nowMs - weekStartMs) / totalSpanMs) * 100
    };

    const items = (weeklyStats?.completedWorkouts ?? []).map((item) => {
      const midpointMs = new Date(item.midpointAt).getTime();
      const clampedMidpointMs = Math.max(weekStartMs, Math.min(weekEndMs, midpointMs));
      const rawLeftPercent = ((clampedMidpointMs - weekStartMs) / totalSpanMs) * 100;
      const leftPercent = Math.max(1.5, Math.min(98.5, rawLeftPercent));
      const startLabel = timeFormatter.format(new Date(item.startedAt));
      const endLabel = timeFormatter.format(new Date(item.finishedAt ?? item.startedAt));
      const durationMinutes = Math.round(getSessionDurationMinutes(item.startedAt, item.finishedAt ?? item.startedAt));

      return {
        ...item,
        leftPercent,
        shortLabel: item.workoutName.trim(),
        metaLabel: `${Math.max(0, durationMinutes)} min`,
        title: `${item.workoutName} • ${item.weekdayLabel} • ${startLabel}–${endLabel}`
      };
    });

    return { dayLabels, ticks, items, nowTick };
  }, [clockTick, language, weekStart, weeklyStats?.completedWorkouts]);

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
          <div className="py-3">
            <div className="h-px bg-border" />
          </div>
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
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Dumbbell className="h-3.5 w-3.5" />
                {t("workoutsThisWeek")}
              </p>
              <p className="text-base font-semibold">{weeklyStats?.workoutCount ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {t("duration")}
              </p>
              <p className="text-base font-semibold">{formatDurationShort(weeklyStats?.durationMinutesTotal ?? 0, language)}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                {t("sets")}
              </p>
              <p className="text-base font-semibold">{weeklyStats?.setCount ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" />
                {t("repsTotal")}
              </p>
              <p className="text-base font-semibold">{weeklyStats?.repsTotal ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Weight className="h-3.5 w-3.5" />
                {t("totalWeight")}
              </p>
              <p className="text-base font-semibold">
                {formatNumber(weeklyStats?.totalWeight ?? 0, 0)} {weightUnit}
              </p>
            </div>
            <div className="relative rounded-lg border bg-card px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Flame className="h-3.5 w-3.5" />
                  {t("calories")}
                </p>
                {weeklyStats?.usesDefaultBodyWeightForCalories && (
                  <InfoHint
                    ariaLabel={t("calories")}
                    text={t("caloriesEstimateAverageHint")}
                    className="-mr-1 -mt-0.5 shrink-0"
                  />
                )}
              </div>
              <p className="text-base font-semibold">
                ~{formatNumber(weeklyStats?.caloriesTotal ?? 0, 0)} kcal
              </p>
            </div>
          </div>

          <div className="py-3">
            <div className="h-px bg-border" />
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-base font-semibold leading-tight text-foreground/75">
                {t("sessions")}
              </p>
            </div>
            {(weeklyStats?.completedWorkouts.length ?? 0) > 0 ? (
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

                  <div
                    className="absolute bottom-3 -translate-x-1/2"
                    style={{ left: `${weeklySessionsTimeline.nowTick.leftPercent}%` }}
                    aria-hidden="true"
                  >
                    <div className="w-[2px] h-5 rounded-full bg-foreground" />
                  </div>

                  {weeklySessionsTimeline.items.map((item) => (
                    <Link
                      key={item.sessionId}
                      to={`/workouts/${item.workoutId}/history#session-${item.sessionId}`}
                      title={item.title}
                      className="group absolute bottom-4 -translate-x-1/2"
                      style={{ left: `${item.leftPercent}%` }}
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
            ) : (
              <div className="px-1 py-1">
                <p className="text-sm text-muted-foreground">{t("noWorkoutsThisWeek")}</p>
              </div>
            )}
          </section>

          <div className="py-3">
            <div className="h-px bg-border" />
          </div>

          {weeklyGoalItems.length > 0 && (
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
                    onClick={() => setMuscleMetricMode(mode)}
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
                {weeklyMuscleChart.totalValue > 0 ? (
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
                          const points: Array<{ x: number; y: number }> = weeklyMuscleChart.items.map((item, index) => {
                            const angle = (-120 + index * 60) * (Math.PI / 180);
                            const ratio = weeklyMuscleChart.maxValue > 0 ? item.value / weeklyMuscleChart.maxValue : 0;
                            const radius = 28 + ratio * 88;
                            const x = 180 + Math.cos(angle) * radius;
                            const y = 180 + Math.sin(angle) * radius;
                            return { x, y };
                          });
                          const path = buildRoundedRadarPath(points, 2.5);

                          return (
                            <>
                              <path
                                d={path}
                                fill="currentColor"
                                className="text-primary/15"
                                stroke="none"
                              />
                              <path
                                d={path}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-primary"
                              />
                            </>
                          );
                        })()}
                    </svg>
                  </div>
                ) : (
                  <p className="px-3 py-3 text-center text-sm text-muted-foreground">{t("noMuscleDataThisWeekHint")}</p>
                )}
              </CardContent>
            </Card>
          </section>
        </section>
      )}

      <Dialog open={discardConfirmSessionId !== null} onOpenChange={(open) => !open && setDiscardConfirmSessionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discardSession")}</DialogTitle>
            <DialogDescription>{t("discardSessionConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardConfirmSessionId(null)}>
              {t("cancel")}
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={() => void handleDiscardConfirmed()}
            >
              {t("discardSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
