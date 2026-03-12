import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams, type To } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChartNoAxesCombined,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Dumbbell,
  House,
  PenSquare,
  Play,
  Plus,
  Save,
  Scale,
  Settings,
  Shield,
  Sparkles,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { LockerNoteInput } from "@/components/forms/locker-note-input";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import { useSettings } from "@/app/settings-context";
import { db } from "@/db/db";
import type { WorkoutIconKey } from "@/lib/workout-icons";
import { cn } from "@/lib/utils";
import { useEarliestCompletedPeriodStart } from "@/features/dashboard/use-dashboard-page-data";
import {
  clearLegacyStatisticsWeekParam,
  formatStatisticsPeriodLabel,
  getNextStatisticsPeriodLabelKey,
  getPreviousStatisticsPeriodLabelKey,
  getStatisticsPeriodOffset,
  getStatisticsPeriodStart,
  getStatisticsPeriodTitleKey,
  parseStatisticsOffset,
  parseStatisticsPeriod,
  shiftStatisticsPeriodStart,
  STATS_OFFSET_SEARCH_PARAM,
  STATS_PERIOD_SEARCH_PARAM,
  STATS_WORKOUT_ID_SEARCH_PARAM,
  type StatisticsPeriod
} from "@/features/statistics/weekly-data-utils";

// iOS homescreen hint (temporarily disabled; keep for later re-enable)
// const IOS_WEBAPP_HINT_DISMISSED_KEY = "gymtracker:ios-webapp-hint-dismissed";
//
// function isStandaloneDisplayMode() {
//   const nav = window.navigator as Navigator & { standalone?: boolean };
//   return (
//     window.matchMedia("(display-mode: standalone)").matches ||
//     window.matchMedia("(display-mode: fullscreen)").matches ||
//     nav.standalone === true
//   );
// }
//
// function isLikelyIosDevice() {
//   const ua = window.navigator.userAgent;
//   return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
// }

interface SessionHeaderState {
  sessionId: number;
  total: number;
  completed: number;
  elapsedMs: number;
  elapsedSeconds: number;
  sinceIso: string | null;
  doneAndReady: boolean;
}

interface HeaderActionsProps {
  showEditorSave: boolean;
  onEditorCancel: () => void;
  onEditorSave: () => void;
}

interface StatisticsWeekHeaderControlsProps {
  weekLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
}

interface StatisticsPeriodSelectProps {
  value: StatisticsPeriod;
  onChange: (period: StatisticsPeriod) => void;
  label: string;
  options: Array<{ value: StatisticsPeriod; label: string; separated?: boolean }>;
}

interface StatisticsWorkoutSelectProps {
  workoutLabel: string;
  workouts: Array<{ id: number; name: string; icon?: WorkoutIconKey | null }>;
  selectedWorkoutId: number | null;
  onChange: (workoutId: number) => void;
}

interface BottomNavItemProps {
  to: To;
  isActive: boolean;
  label: string;
  icon: ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
}

const LAST_STATISTICS_ROUTE_STORAGE_KEY = "gymtracker:last-statistics-route";

function BottomNavItem({
  to,
  isActive,
  label,
  icon,
  activeClassName,
  inactiveClassName
}: BottomNavItemProps) {
  return (
    <div className="flex w-[4.8875rem] shrink-0 justify-center">
      <Link
        to={to}
        viewTransition
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-[3.1625rem] items-center justify-center rounded-full transition-[padding,background-color,color] duration-200",
          isActive ? "px-[1.725rem]" : "px-[1.15rem]",
          isActive ? activeClassName : inactiveClassName
        )}
      >
        {icon}
      </Link>
    </div>
  );
}

function HeaderActions({
  showEditorSave,
  onEditorCancel,
  onEditorSave
}: HeaderActionsProps) {
  const { t } = useSettings();

  if (showEditorSave) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("cancel")}
          title={t("cancel")}
          onClick={onEditorCancel}
        >
          <X className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={onEditorSave}>
          <Save className="mr-2 h-4 w-4" />
          {t("save")}
        </Button>
      </div>
    );
  }

  return null;
}

function StatisticsWeekHeaderControls({
  weekLabel,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel
}: StatisticsWeekHeaderControlsProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border/80 bg-secondary/75 p-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={onPrevious}
        aria-label={previousLabel}
        title={previousLabel}
        disabled={!canGoPrevious}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <p className="w-[6.75rem] truncate whitespace-nowrap px-1 text-center text-[11px] font-semibold tabular-nums leading-none text-foreground/80 sm:min-w-[9.5rem] sm:max-w-[9.5rem] sm:text-xs">
        {weekLabel}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={onNext}
        aria-label={nextLabel}
        title={nextLabel}
        disabled={!canGoNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function StatisticsPeriodSelect({
  value,
  onChange,
  label,
  options
}: StatisticsPeriodSelectProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex min-w-0 items-center gap-1 rounded-full px-1 py-0.5 text-left text-lg font-semibold text-foreground transition-colors hover:bg-secondary/70"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as StatisticsPeriod)}>
          {options.map((option) => (
            <Fragment key={option.value}>
              {option.separated ? <DropdownMenuSeparator /> : null}
              <DropdownMenuRadioItem value={option.value}>{option.label}</DropdownMenuRadioItem>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatisticsWorkoutSelect({
  workoutLabel,
  workouts,
  selectedWorkoutId,
  onChange
}: StatisticsWorkoutSelectProps) {
  const selectedWorkout = workouts.find((workout) => workout.id === selectedWorkoutId) ?? workouts[0] ?? null;

  return (
    <div className="flex items-center gap-1 rounded-full border border-border/80 bg-secondary/75 p-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={workoutLabel}
            className="inline-flex min-w-0 max-w-[11.5rem] items-center gap-1 rounded-full px-2 py-1 text-left text-[11px] font-semibold leading-none text-foreground/80 transition-colors hover:bg-background/70 disabled:cursor-default disabled:hover:bg-transparent sm:max-w-[14rem] sm:text-xs"
            disabled={!selectedWorkout}
          >
            <span className="min-w-0 truncate">
              {selectedWorkout ? (
                <WorkoutNameLabel
                  name={selectedWorkout.name}
                  icon={selectedWorkout.icon}
                  textClassName="truncate"
                />
              ) : (
                workoutLabel
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuRadioGroup
            value={selectedWorkout ? String(selectedWorkout.id) : ""}
            onValueChange={(nextValue) => onChange(Number(nextValue))}
          >
            {workouts.map((workout) => (
              <DropdownMenuRadioItem key={`statistics-workout-${workout.id}`} value={String(workout.id)}>
                <WorkoutNameLabel
                  name={workout.name}
                  icon={workout.icon}
                  textClassName="truncate"
                />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppShell() {
  const { t, lockerNoteEnabled, language } = useSettings();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedStatisticsSearch, setSavedStatisticsSearch] = useState("");
  const pathname = location.pathname;
  const sessionMatch = location.pathname.match(/^\/sessions\/(\d+)$/);
  const workoutEditMatch = location.pathname.match(/^\/workouts\/(\d+)\/edit$/);
  const activeSessionId = sessionMatch ? Number(sessionMatch[1]) : null;
  const isWorkoutEditRoute = !!workoutEditMatch;
  const isHomeTabRoute =
    pathname === "/" ||
    pathname === "/import" ||
    /^\/workouts\/add$/.test(pathname) ||
    /^\/workouts\/new$/.test(pathname) ||
    /^\/workouts\/\d+\/edit$/.test(pathname);
  const isStatisticsTabRoute =
    pathname === "/statistics";
  const isSettingsTabRoute =
    pathname === "/settings" ||
    pathname === "/legal" ||
    pathname === "/privacy";
  const showStatisticsPeriodHeader = pathname === "/statistics";
  const statisticsPeriod = useMemo(
    () => parseStatisticsPeriod(searchParams.get(STATS_PERIOD_SEARCH_PARAM)),
    [searchParams]
  );
  const statisticsOffset = useMemo(
    () =>
      parseStatisticsOffset(
        searchParams.get(STATS_OFFSET_SEARCH_PARAM),
        searchParams.get("week")
      ),
    [searchParams]
  );
  const selectedStatisticsWorkoutId = useMemo(() => {
    const raw = searchParams.get(STATS_WORKOUT_ID_SEARCH_PARAM);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const statisticsPeriodOptions = useMemo(
    () => [
      { value: "week" as const, label: t("weeklyData") },
      { value: "month" as const, label: t("monthlyData") },
      { value: "year" as const, label: t("yearlyData") },
      { value: "workout" as const, label: t("workoutData"), separated: true }
    ],
    [t]
  );
  const statisticsTitle = t(getStatisticsPeriodTitleKey(statisticsPeriod));
  const statisticsNavigationPeriod = statisticsPeriod === "workout" ? "week" : statisticsPeriod;
  const earliestCompletedPeriodStart = useEarliestCompletedPeriodStart(statisticsNavigationPeriod);
  const currentStatisticsPeriodStart = getStatisticsPeriodStart(new Date(), statisticsNavigationPeriod);
  const earliestStatisticsOffset = useMemo(() => {
    if (!earliestCompletedPeriodStart) {
      return null;
    }

    return getStatisticsPeriodOffset(
      currentStatisticsPeriodStart,
      earliestCompletedPeriodStart,
      statisticsNavigationPeriod
    );
  }, [currentStatisticsPeriodStart, earliestCompletedPeriodStart, statisticsNavigationPeriod]);
  const visibleStatisticsPeriodStart = useMemo(
    () => shiftStatisticsPeriodStart(currentStatisticsPeriodStart, statisticsNavigationPeriod, statisticsOffset),
    [currentStatisticsPeriodStart, statisticsNavigationPeriod, statisticsOffset]
  );
  const statisticsPeriodLabel = useMemo(
    () => formatStatisticsPeriodLabel(visibleStatisticsPeriodStart, statisticsNavigationPeriod, language),
    [language, statisticsNavigationPeriod, visibleStatisticsPeriodStart]
  );
  const canNavigateStatisticsPeriods = showStatisticsPeriodHeader && statisticsPeriod !== "workout";
  const canNavigateToPreviousStatisticsPeriod =
    canNavigateStatisticsPeriods && earliestStatisticsOffset !== null && statisticsOffset > earliestStatisticsOffset;
  const canNavigateToNextStatisticsPeriod = canNavigateStatisticsPeriods && statisticsOffset < 0;
  const statisticsNavTo = useMemo<To>(() => {
    if (!savedStatisticsSearch) {
      return "/statistics";
    }

    return { pathname: "/statistics", search: savedStatisticsSearch };
  }, [savedStatisticsSearch]);
  const statisticsWorkouts = useLiveQuery(async () => {
    const workouts = await db.workouts.toArray();
    return workouts
      .filter((workout): workout is typeof workout & { id: number } => workout.id !== undefined)
      .sort((a, b) => a.id - b.id)
      .map((workout) => ({
        id: workout.id,
        name: workout.name,
        icon: workout.icon
      }));
  }, []);
  const selectedStatisticsWorkout = useMemo(() => {
    if (!statisticsWorkouts || statisticsWorkouts.length === 0) {
      return null;
    }

    return statisticsWorkouts.find((workout) => workout.id === selectedStatisticsWorkoutId) ?? statisticsWorkouts[0];
  }, [selectedStatisticsWorkoutId, statisticsWorkouts]);

  const pageHeader = useMemo(() => {
    let title = t("appName");
    let Icon = Dumbbell;
    let iconClassName = "text-muted-foreground";
    let titleClassName = "text-foreground";
    let containerClassName = "";

    if (location.pathname === "/") {
      title = t("appName");
      Icon = Dumbbell;
      iconClassName = "text-emerald-500 dark:text-emerald-200";
      titleClassName = "text-emerald-500 dark:text-emerald-200";
      containerClassName = "rounded-full bg-emerald-100 px-3.5 py-1.5 dark:bg-emerald-950";
    } else if (location.pathname === "/statistics") {
      title = statisticsTitle;
      Icon = statisticsPeriod === "workout" ? ChartNoAxesColumn : ChartNoAxesCombined;
    } else if (location.pathname === "/settings") {
      title = t("settings");
      Icon = Settings;
    } else if (location.pathname === "/import") {
      title = t("aiGenerate");
      Icon = Sparkles;
    } else if (location.pathname === "/legal") {
      title = t("legal");
      Icon = Scale;
    } else if (location.pathname === "/privacy") {
      title = t("privacy");
      Icon = Shield;
    } else if (/^\/workouts\/add$/.test(location.pathname)) {
      title = t("addWorkout");
      Icon = Plus;
    } else if (/^\/workouts\/new$/.test(location.pathname)) {
      title = t("newWorkout");
      Icon = Plus;
    } else if (/^\/workouts\/\d+\/edit$/.test(location.pathname)) {
      title = t("editWorkoutTitle");
      Icon = PenSquare;
    } else if (/^\/sessions\/\d+$/.test(location.pathname)) {
      title = "Aktive Session";
      Icon = Play;
    }

    return { title, Icon, iconClassName, titleClassName, containerClassName };
  }, [location.pathname, statisticsPeriod, statisticsTitle, t]);

  const sessionMeta = useLiveQuery(async () => {
    if (!activeSessionId || Number.isNaN(activeSessionId)) {
      return null;
    }

    const session = await db.sessions.get(activeSessionId);
    if (!session || session.status !== "active") {
      return null;
    }

    const sets = await db.sessionExerciseSets.where("sessionId").equals(activeSessionId).toArray();
    const total = sets.length;
    const completed = sets.filter((set) => set.completed).length;
    const lastCompletedAt = sets
      .filter((set) => set.completedAt)
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())[0]
      ?.completedAt;

    return {
      sessionId: activeSessionId,
      total,
      completed,
      startedAt: session.startedAt,
      sinceIso: lastCompletedAt ?? null
    };
  }, [activeSessionId]);

  const activeSessionNav = useLiveQuery(async () => {
    const activeSessions = await db.sessions.where("status").equals("active").toArray();
    activeSessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const active = activeSessions[0];
    if (!active?.id) {
      return null;
    }

    return { sessionId: active.id };
  }, []);


  const [now, setNow] = useState(() => Date.now());
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerPausedTotalMs, setTimerPausedTotalMs] = useState(0);
  const [timerPauseStartedAt, setTimerPauseStartedAt] = useState<number | null>(null);
  // const [showIosWebAppHint, setShowIosWebAppHint] = useState(false);
  //
  // useEffect(() => {
  //   const dismissed = localStorage.getItem(IOS_WEBAPP_HINT_DISMISSED_KEY) === "true";
  //   if (dismissed || !isLikelyIosDevice() || isStandaloneDisplayMode()) {
  //     return;
  //   }
  //   setShowIosWebAppHint(true);
  // }, []);

  useEffect(() => {
    if (!sessionMeta) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionMeta]);

  useEffect(() => {
    setTimerPaused(false);
    setTimerPausedTotalMs(0);
    setTimerPauseStartedAt(null);
  }, [sessionMeta?.sessionId, sessionMeta?.sinceIso]);

  const sessionState = useMemo<SessionHeaderState | null>(() => {
    if (!sessionMeta) {
      return null;
    }

    const elapsedMs = sessionMeta.sinceIso
      ? (() => {
          const rawElapsedMs = now - new Date(sessionMeta.sinceIso).getTime();
          const activePauseMs = timerPaused && timerPauseStartedAt ? now - timerPauseStartedAt : 0;
          return Math.max(0, rawElapsedMs - timerPausedTotalMs - activePauseMs);
        })()
      : 0;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    return {
      sessionId: sessionMeta.sessionId,
      total: sessionMeta.total,
      completed: sessionMeta.completed,
      elapsedMs,
      elapsedSeconds,
      sinceIso: sessionMeta.sinceIso,
      doneAndReady: sessionMeta.total > 0 && sessionMeta.completed === sessionMeta.total
    };
  }, [sessionMeta, now, timerPaused, timerPauseStartedAt, timerPausedTotalMs]);

  useEffect(() => {
    if (!sessionState) {
      return;
    }

    const emittedAtMs = Date.now();
    window.dispatchEvent(
      new CustomEvent("gymtracker:rest-timer-state", {
        detail: {
          sessionId: sessionState.sessionId,
          elapsedMs: sessionState.elapsedMs,
          elapsedSeconds: sessionState.elapsedSeconds,
          paused: timerPaused,
          sinceIso: sessionState.sinceIso ?? null,
          emittedAtMs
        }
      })
    );
  }, [sessionState, timerPaused]);

  const updateStatisticsRouteState = useCallback(
    (nextPeriod: StatisticsPeriod, nextOffset: number) => {
      const normalizedOffset = Number.isInteger(nextOffset) && nextOffset <= 0 ? nextOffset : 0;
      const nextSearchParams = new URLSearchParams(searchParams);

      if (nextPeriod === "week") {
        nextSearchParams.delete(STATS_PERIOD_SEARCH_PARAM);
      } else {
        nextSearchParams.set(STATS_PERIOD_SEARCH_PARAM, nextPeriod);
      }

      if (nextPeriod === "workout" || normalizedOffset === 0) {
        nextSearchParams.delete(STATS_OFFSET_SEARCH_PARAM);
      } else {
        nextSearchParams.set(STATS_OFFSET_SEARCH_PARAM, String(normalizedOffset));
      }

      clearLegacyStatisticsWeekParam(nextSearchParams);
      setSearchParams(nextSearchParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSavedStatisticsSearch(window.localStorage.getItem(LAST_STATISTICS_ROUTE_STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || pathname !== "/statistics") {
      return;
    }

    window.localStorage.setItem(LAST_STATISTICS_ROUTE_STORAGE_KEY, location.search);
    setSavedStatisticsSearch(location.search);
  }, [location.search, pathname]);

  useEffect(() => {
    if (!showStatisticsPeriodHeader || statisticsPeriod === "workout" || earliestStatisticsOffset === null) {
      return;
    }

    if (statisticsOffset < earliestStatisticsOffset) {
      updateStatisticsRouteState(statisticsPeriod, earliestStatisticsOffset);
    }
  }, [
    earliestStatisticsOffset,
    showStatisticsPeriodHeader,
    statisticsOffset,
    statisticsPeriod,
    updateStatisticsRouteState
  ]);

  useEffect(() => {
    if (!showStatisticsPeriodHeader || statisticsPeriod !== "workout") {
      return;
    }

    const normalizedWorkoutId = selectedStatisticsWorkout ? String(selectedStatisticsWorkout.id) : null;
    const currentWorkoutId = searchParams.get(STATS_WORKOUT_ID_SEARCH_PARAM);

    if (normalizedWorkoutId === currentWorkoutId || (normalizedWorkoutId === null && currentWorkoutId === null)) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    if (normalizedWorkoutId === null) {
      nextSearchParams.delete(STATS_WORKOUT_ID_SEARCH_PARAM);
    } else {
      nextSearchParams.set(STATS_WORKOUT_ID_SEARCH_PARAM, normalizedWorkoutId);
    }
    nextSearchParams.delete(STATS_OFFSET_SEARCH_PARAM);
    clearLegacyStatisticsWeekParam(nextSearchParams);
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    searchParams,
    selectedStatisticsWorkout,
    setSearchParams,
    showStatisticsPeriodHeader,
    statisticsPeriod
  ]);

  const showLockerNote = lockerNoteEnabled && !isWorkoutEditRoute && !showStatisticsPeriodHeader;
  const handleToggleTimer = useCallback(() => {
    if (!sessionState?.sinceIso) {
      return;
    }

    const toggleAtMs = Date.now();
    setNow(toggleAtMs);

    if (timerPaused) {
      if (timerPauseStartedAt) {
        setTimerPausedTotalMs((prev) => prev + (toggleAtMs - timerPauseStartedAt));
      }
      setTimerPauseStartedAt(null);
      setTimerPaused(false);
      return;
    }

    setTimerPauseStartedAt(toggleAtMs);
    setTimerPaused(true);
  }, [sessionState?.sinceIso, timerPauseStartedAt, timerPaused]);

  useEffect(() => {
    if (!sessionMeta?.sessionId) {
      return;
    }

    const onToggleRestTimerRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId?: number }>;
      if (customEvent.detail?.sessionId !== sessionMeta.sessionId) {
        return;
      }
      handleToggleTimer();
    };

    window.addEventListener("gymtracker:toggle-rest-timer", onToggleRestTimerRequest as EventListener);
    return () => {
      window.removeEventListener("gymtracker:toggle-rest-timer", onToggleRestTimerRequest as EventListener);
    };
  }, [handleToggleTimer, sessionMeta?.sessionId]);

  const handleEditorSave = () => {
    window.dispatchEvent(new CustomEvent("gymtracker:save-workout-editor"));
  };
  const handleEditorCancel = () => {
    window.dispatchEvent(new CustomEvent("gymtracker:cancel-workout-editor"));
  };

  // const dismissIosWebAppHint = () => {
  //   localStorage.setItem(IOS_WEBAPP_HINT_DISMISSED_KEY, "true");
  //   setShowIosWebAppHint(false);
  // };

  useEffect(() => {
    if (!location.pathname.startsWith("/sessions/")) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col bg-background">
      <header className={activeSessionId ? "border-x-0 border-b border-t-0 bg-background" : "sticky top-0 z-20 border-x-0 border-b border-t-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70"}>
        <div className="container flex h-14 items-center justify-between">
          <div className={`flex min-w-0 items-center gap-2 ${pageHeader.containerClassName}`}>
            <pageHeader.Icon className={`h-5 w-5 shrink-0 ${pageHeader.iconClassName}`} />
            {showStatisticsPeriodHeader ? (
              <StatisticsPeriodSelect
                value={statisticsPeriod}
                onChange={(nextPeriod) => updateStatisticsRouteState(nextPeriod, 0)}
                label={t("statisticsPeriod")}
                options={statisticsPeriodOptions}
              />
            ) : (
              <p className={`truncate text-lg font-semibold ${pageHeader.titleClassName}`}>{pageHeader.title}</p>
            )}
            {activeSessionId && sessionState && (() => {
              const pct = sessionState.total > 0 ? Math.round((sessionState.completed / sessionState.total) * 100) : 0;
              return (
                <div className="relative shrink-0 overflow-hidden rounded-full bg-emerald-100 pl-3.5 pr-5 py-0.5 dark:bg-emerald-950">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-emerald-600 dark:text-emerald-200">
                    <Check className="h-3 w-3 shrink-0" />
                    {sessionState.completed}/{sessionState.total}
                  </span>
                  <div className="absolute inset-x-[6px] bottom-0 h-[3px] bg-emerald-200 dark:bg-emerald-900">
                    <div className="h-full bg-emerald-600 transition-all dark:bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <HeaderActions
              showEditorSave={isWorkoutEditRoute}
              onEditorCancel={handleEditorCancel}
              onEditorSave={handleEditorSave}
            />
            {showStatisticsPeriodHeader && statisticsPeriod !== "workout" && (
              <StatisticsWeekHeaderControls
                weekLabel={statisticsPeriodLabel}
                canGoPrevious={canNavigateToPreviousStatisticsPeriod}
                canGoNext={canNavigateToNextStatisticsPeriod}
                onPrevious={() => {
                  if (earliestStatisticsOffset === null) {
                    return;
                  }
                  updateStatisticsRouteState(
                    statisticsPeriod,
                    Math.max(earliestStatisticsOffset, statisticsOffset - 1)
                  );
                }}
                onNext={() => updateStatisticsRouteState(statisticsPeriod, Math.min(0, statisticsOffset + 1))}
                previousLabel={t(getPreviousStatisticsPeriodLabelKey(statisticsPeriod))}
                nextLabel={t(getNextStatisticsPeriodLabelKey(statisticsPeriod))}
              />
            )}
            {showStatisticsPeriodHeader && statisticsPeriod === "workout" && (
              <StatisticsWorkoutSelect
                workoutLabel={t("workouts")}
                workouts={statisticsWorkouts ?? []}
                selectedWorkoutId={selectedStatisticsWorkout?.id ?? null}
                onChange={(workoutId) => {
                  const nextSearchParams = new URLSearchParams(searchParams);
                  nextSearchParams.set(STATS_PERIOD_SEARCH_PARAM, "workout");
                  nextSearchParams.set(STATS_WORKOUT_ID_SEARCH_PARAM, String(workoutId));
                  nextSearchParams.delete(STATS_OFFSET_SEARCH_PARAM);
                  clearLegacyStatisticsWeekParam(nextSearchParams);
                  setSearchParams(nextSearchParams, { replace: true });
                }}
              />
            )}
            {showLockerNote && <LockerNoteInput />}
          </div>
        </div>
      </header>
      <main className="container flex-1 py-4 pb-28 sm:pb-24">
        <div key={location.pathname} className="gt-route-enter">
          <Outlet />
        </div>
      </main>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[29] h-28 bg-gradient-to-t from-background/95 via-background/72 to-transparent"
        aria-hidden="true"
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 px-4">
        <div className="relative mx-auto max-w-3xl">
          <nav className="pointer-events-auto flex justify-center" aria-label="Primary">
            <div className="flex items-center gap-0 rounded-full border border-white/50 bg-background/80 p-0.5 shadow-[0_-10px_30px_rgba(15,23,42,0.08),0_22px_52px_rgba(15,23,42,0.14)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 dark:border-transparent dark:bg-card/85 dark:ring-1 dark:ring-border/40 dark:shadow-[0_-12px_26px_rgba(0,0,0,0.4),0_24px_48px_rgba(0,0,0,0.52)] dark:supports-[backdrop-filter]:bg-card/75">
              <BottomNavItem
                to="/"
                isActive={isHomeTabRoute}
                label={t("workouts")}
                icon={<House className="h-[23px] w-[23px]" />}
                activeClassName="bg-primary text-primary-foreground"
                inactiveClassName="text-muted-foreground"
              />
              {activeSessionNav && (
                <BottomNavItem
                  to={`/sessions/${activeSessionNav.sessionId}`}
                  isActive={pathname === `/sessions/${activeSessionNav.sessionId}`}
                  label={t("resumeSession")}
                  icon={<Play className="h-[23px] w-[23px]" />}
                  activeClassName="bg-emerald-500 text-emerald-100"
                  inactiveClassName="text-muted-foreground"
                />
              )}
              <BottomNavItem
                to={statisticsNavTo}
                isActive={isStatisticsTabRoute}
                label={t("statistics")}
                icon={<ChartNoAxesCombined className="h-[23px] w-[23px]" />}
                activeClassName="bg-primary text-primary-foreground"
                inactiveClassName="text-muted-foreground"
              />
              <BottomNavItem
                to="/settings"
                isActive={isSettingsTabRoute}
                label={t("settings")}
                icon={<Settings className="h-[23px] w-[23px]" />}
                activeClassName="bg-primary text-primary-foreground"
                inactiveClassName="text-muted-foreground"
              />
            </div>
          </nav>
        </div>
      </div>
      {/*
      <Dialog open={showIosWebAppHint} onOpenChange={(open) => !open && dismissIosWebAppHint()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("iosWebAppHintTitle")}</DialogTitle>
            <DialogDescription>{t("iosWebAppHintDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t("iosWebAppHintStep1")}</p>
            <p>{t("iosWebAppHintStep2")}</p>
          </div>
          <DialogFooter>
            <Button onClick={dismissIosWebAppHint}>{t("understood")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      */}
    </div>
  );
}
