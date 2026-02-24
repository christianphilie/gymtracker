import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChartNoAxesCombined,
  Check,
  Dumbbell,
  Flag,
  House,
  PenSquare,
  Play,
  Plus,
  Save,
  Scale,
  Settings,
  Shield,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LockerNoteInput } from "@/components/forms/locker-note-input";
import { useSettings } from "@/app/settings-context";
import { db } from "@/db/db";
import { cn, formatDurationClock } from "@/lib/utils";

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
  elapsedSeconds: number;
  sinceIso: string | null;
  doneAndReady: boolean;
}

interface HeaderActionsProps {
  sessionState: SessionHeaderState | null;
  restTimerSeconds: number;
  restTimerEnabled: boolean;
  timerPaused: boolean;
  onToggleTimer: () => void;
  showEditorSave: boolean;
  onEditorSave: () => void;
}

interface HeaderProgressBadgeProps {
  as?: "button" | "div";
  onClick?: () => void;
  ariaLabel?: string;
  progressPercent: number;
  progressBarClassName?: string;
  progressBarStyle?: CSSProperties;
  children: ReactNode;
}

interface BottomNavItemProps {
  to: string;
  isActive: boolean;
  label: string;
  icon: ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
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

function HeaderProgressBadge({
  as = "div",
  onClick,
  ariaLabel,
  progressPercent,
  progressBarClassName,
  progressBarStyle,
  children
}: HeaderProgressBadgeProps) {
  const isButton = as === "button";
  const className = cn(
    "relative h-9 w-[4.5rem] overflow-hidden rounded-md border border-input bg-background/80 shadow-sm",
    isButton && "m-0 p-0 text-left align-top [appearance:none]"
  );
  const progressStyle = { width: `${Math.round(Math.max(0, Math.min(progressPercent, 100)))}%`, ...progressBarStyle };

  const content = (
    <>
      {children}
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-secondary">
        <div className={cn("h-full transition-all", progressBarClassName)} style={progressStyle} />
      </div>
    </>
  );

  if (isButton) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function BottomNavItem({
  to,
  isActive,
  label,
  icon,
  activeClassName,
  inactiveClassName
}: BottomNavItemProps) {
  return (
    <div className="flex w-[4.25rem] shrink-0 justify-center">
      <Link
        to={to}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-full transition-[padding,background-color,color] duration-200",
          isActive ? "px-6" : "px-4",
          isActive ? activeClassName : inactiveClassName
        )}
      >
        {icon}
      </Link>
    </div>
  );
}

function HeaderActions({
  sessionState,
  restTimerSeconds,
  restTimerEnabled,
  timerPaused,
  onToggleTimer,
  showEditorSave,
  onEditorSave
}: HeaderActionsProps) {
  const { t } = useSettings();

  if (sessionState?.doneAndReady) {
    return (
      <Button
        size="icon"
        aria-label={t("completeSession")}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("gymtracker:complete-session", {
              detail: { sessionId: sessionState.sessionId }
            })
          )
        }
      >
        <Flag className="h-4 w-4" />
      </Button>
    );
  }

  if (sessionState) {
    const donePercent = sessionState.total > 0 ? Math.round((sessionState.completed / sessionState.total) * 100) : 0;
    const hasRestTimer = restTimerEnabled && restTimerSeconds > 0;
    const timerProgress = hasRestTimer ? Math.min(sessionState.elapsedSeconds, restTimerSeconds) / restTimerSeconds : 0;
    const timerExceeded = hasRestTimer && sessionState.elapsedSeconds >= restTimerSeconds;
    const timerBarColor = timerExceeded ? "#f59e0b" : "#10b981";

    return (
      <div className="flex items-center gap-2">
        {sessionState.sinceIso && hasRestTimer && (
          <HeaderProgressBadge
            as="button"
            onClick={onToggleTimer}
            ariaLabel={timerPaused ? t("resumeSession") : t("pauseTimer")}
            progressPercent={timerProgress * 100}
            progressBarStyle={{ backgroundColor: timerBarColor }}
          >
            <div className="inline-flex h-full w-full items-start px-2 pt-1.5">
              <p className="inline-flex h-[16px] w-full items-center justify-center gap-1 text-center text-xs font-medium leading-none tabular-nums">
                {timerPaused
                  ? <PlaySolidIcon className="h-4 w-4 shrink-0" />
                  : <PauseSolidIcon className="h-4 w-4 shrink-0" />
                }
                <span>{formatDurationClock(sessionState.elapsedSeconds)}</span>
              </p>
            </div>
          </HeaderProgressBadge>
        )}

        <HeaderProgressBadge progressPercent={donePercent} progressBarClassName="bg-primary">
          <div className="inline-flex h-full w-full items-start px-2 pt-1.5">
            <p className="inline-flex h-[16px] w-full items-center justify-center text-center text-xs font-medium leading-none tabular-nums">
              <Check className="mr-1 h-3.5 w-3.5" />
              {sessionState.completed}/{sessionState.total}
            </p>
          </div>
        </HeaderProgressBadge>
      </div>
    );
  }

  if (showEditorSave) {
    return (
      <Button size="sm" onClick={onEditorSave}>
        <Save className="mr-2 h-4 w-4" />
        {t("save")}
      </Button>
    );
  }

  return null;
}

export function AppShell() {
  const { t, restTimerSeconds, restTimerEnabled, lockerNoteEnabled } = useSettings();
  const location = useLocation();
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
    pathname === "/statistics" ||
    /^\/workouts\/\d+\/history$/.test(pathname);
  const isSettingsTabRoute =
    pathname === "/settings" ||
    pathname === "/legal" ||
    pathname === "/privacy";
  const pageHeader = useMemo(() => {
    let title = t("appName");
    let Icon = Dumbbell;
    let iconClassName = "text-muted-foreground";
    let titleClassName = "text-foreground";
    let containerClassName = "";

    if (location.pathname === "/") {
      title = t("appName");
      Icon = Dumbbell;
      iconClassName = "text-emerald-500";
      titleClassName = "text-emerald-500";
      containerClassName = "rounded-full bg-emerald-100 px-3.5 py-1.5";
    } else if (location.pathname === "/statistics") {
      title = t("statistics");
      Icon = ChartNoAxesCombined;
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
    } else if (/^\/workouts\/\d+\/history$/.test(location.pathname)) {
      title = t("sessionHistory");
      Icon = ChartNoAxesCombined;
    } else if (/^\/sessions\/\d+$/.test(location.pathname)) {
      title = "Session";
      Icon = Play;
    }

    return { title, Icon, iconClassName, titleClassName, containerClassName };
  }, [location.pathname, t]);

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

    const elapsedSeconds = sessionMeta.sinceIso
      ? (() => {
          const rawElapsedMs = now - new Date(sessionMeta.sinceIso).getTime();
          const activePauseMs = timerPaused && timerPauseStartedAt ? now - timerPauseStartedAt : 0;
          const adjustedMs = Math.max(0, rawElapsedMs - timerPausedTotalMs - activePauseMs);
          return Math.floor(adjustedMs / 1000);
        })()
      : 0;
    return {
      sessionId: sessionMeta.sessionId,
      total: sessionMeta.total,
      completed: sessionMeta.completed,
      elapsedSeconds,
      sinceIso: sessionMeta.sinceIso,
      doneAndReady: sessionMeta.total > 0 && sessionMeta.completed === sessionMeta.total
    };
  }, [sessionMeta, now, timerPaused, timerPauseStartedAt, timerPausedTotalMs]);
  const showLockerNote = lockerNoteEnabled && !isWorkoutEditRoute;
  const handleToggleTimer = () => {
    if (!sessionState?.sinceIso) {
      return;
    }

    if (timerPaused) {
      if (timerPauseStartedAt) {
        setTimerPausedTotalMs((prev) => prev + (Date.now() - timerPauseStartedAt));
      }
      setTimerPauseStartedAt(null);
      setTimerPaused(false);
      return;
    }

    setTimerPauseStartedAt(Date.now());
    setTimerPaused(true);
  };

  const handleEditorSave = () => {
    window.dispatchEvent(new CustomEvent("gymtracker:save-workout-editor"));
  };

  // const dismissIosWebAppHint = () => {
  //   localStorage.setItem(IOS_WEBAPP_HINT_DISMISSED_KEY, "true");
  //   setShowIosWebAppHint(false);
  // };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col bg-background">
      <header className="sticky top-0 z-20 border-x-0 border-b border-t-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-14 items-center justify-between">
          <div className={`flex min-w-0 items-center gap-2 ${pageHeader.containerClassName}`}>
            <pageHeader.Icon className={`h-5 w-5 shrink-0 ${pageHeader.iconClassName}`} />
            <p className={`truncate text-lg font-semibold ${pageHeader.titleClassName}`}>{pageHeader.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <HeaderActions
              sessionState={sessionState}
              restTimerSeconds={restTimerSeconds}
              restTimerEnabled={restTimerEnabled}
              timerPaused={timerPaused}
              onToggleTimer={handleToggleTimer}
              showEditorSave={isWorkoutEditRoute}
              onEditorSave={handleEditorSave}
            />
            {showLockerNote && <LockerNoteInput />}
          </div>
        </div>
      </header>


      <main className="container flex-1 py-4 pb-28 sm:pb-24">
        <Outlet />
      </main>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 px-4">
        <div className="relative mx-auto max-w-3xl">
          <nav className="pointer-events-auto flex justify-center" aria-label="Primary">
            <div className="flex items-center gap-0 rounded-full border border-white/50 bg-background/80 p-0.5 shadow-[0_-10px_30px_rgba(15,23,42,0.08),0_22px_52px_rgba(15,23,42,0.14)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
              <BottomNavItem
                to="/"
                isActive={isHomeTabRoute}
                label={t("workouts")}
                icon={<House className="h-5 w-5" />}
                activeClassName="bg-primary text-primary-foreground"
                inactiveClassName="text-muted-foreground hover:bg-secondary hover:text-foreground"
              />
              {activeSessionNav && (
                <BottomNavItem
                  to={`/sessions/${activeSessionNav.sessionId}`}
                  isActive={pathname === `/sessions/${activeSessionNav.sessionId}`}
                  label={t("resumeSession")}
                  icon={<Play className="h-5 w-5" />}
                  activeClassName="bg-emerald-400 text-emerald-100"
                  inactiveClassName="text-foreground hover:bg-secondary hover:text-foreground"
                />
              )}
              <BottomNavItem
                to="/statistics"
                isActive={isStatisticsTabRoute}
                label={t("statistics")}
                icon={<ChartNoAxesCombined className="h-5 w-5" />}
                activeClassName="bg-primary text-primary-foreground"
                inactiveClassName="text-muted-foreground hover:bg-secondary hover:text-foreground"
              />
              <BottomNavItem
                to="/settings"
                isActive={isSettingsTabRoute}
                label={t("settings")}
                icon={<Settings className="h-5 w-5" />}
                activeClassName="bg-primary text-primary-foreground"
                inactiveClassName="text-muted-foreground hover:bg-secondary hover:text-foreground"
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
