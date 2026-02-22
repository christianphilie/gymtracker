import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Dumbbell, Flag, Import, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/app/settings-context";
import { db } from "@/db/db";
import { formatDurationClock } from "@/lib/utils";

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
  timerPaused: boolean;
  onToggleTimer: () => void;
}

function HeaderActions({ sessionState, restTimerSeconds, timerPaused, onToggleTimer }: HeaderActionsProps) {
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
    const timerProgress = Math.min(sessionState.elapsedSeconds, restTimerSeconds) / restTimerSeconds;
    const timerExceeded = sessionState.elapsedSeconds >= restTimerSeconds;
    const timerBarColor = timerExceeded ? "#f59e0b" : "#16a34a";

    return (
      <div className="flex items-center gap-2">
        {sessionState.sinceIso && (
          <button
            type="button"
            className="m-0 w-[102px] space-y-1 border-0 bg-transparent p-0 text-left align-top [appearance:none]"
            onClick={onToggleTimer}
            aria-label={timerPaused ? t("resumeSession") : t("pauseTimer")}
          >
            <p className="inline-flex h-[16px] w-full items-center justify-start text-left text-xs font-medium leading-none">
              {timerPaused ? t("paused") : formatDurationClock(sessionState.elapsedSeconds)}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full border bg-secondary">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.round(timerProgress * 100)}%`, backgroundColor: timerBarColor }}
              />
            </div>
          </button>
        )}

        <div className="w-[102px] space-y-1">
          <p className="inline-flex h-[16px] w-full items-center justify-end text-right text-xs font-medium leading-none">
            {t("setSingular")} {sessionState.completed}/{sessionState.total}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full border bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${donePercent}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button asChild variant="outline" size="icon" aria-label={t("newWorkout")}>
        <Link to="/workouts/new">
          <Plus className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="icon" aria-label={t("import")}>
        <Link to="/import">
          <Import className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="icon" aria-label={t("settings")}>
        <Link to="/settings">
          <Settings className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

export function AppShell() {
  const { t, restTimerSeconds } = useSettings();
  const location = useLocation();
  const sessionMatch = location.pathname.match(/^\/sessions\/(\d+)$/);
  const activeSessionId = sessionMatch ? Number(sessionMatch[1]) : null;

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

  const [now, setNow] = useState(() => Date.now());
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerPausedTotalMs, setTimerPausedTotalMs] = useState(0);
  const [timerPauseStartedAt, setTimerPauseStartedAt] = useState<number | null>(null);

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

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background">
      <header className="sticky top-0 z-20 border-x-0 border-b border-t-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
            <Dumbbell className="h-4 w-4" />
            {t("appName")}
          </Link>
          <HeaderActions
            sessionState={sessionState}
            restTimerSeconds={restTimerSeconds}
            timerPaused={timerPaused}
            onToggleTimer={handleToggleTimer}
          />
        </div>
      </header>

      <main className="container py-4 pb-6">
        <Outlet />
      </main>

      <footer className="border-t bg-background/80">
        <div className="container flex flex-col gap-1 py-3 text-center text-xs text-muted-foreground">
          <p>
            {t("footerMadeWith")} <span className="text-foreground">❤</span> {t("footerBy")}{" "}
            <a
              href="https://github.com/christianphilie/gymtracker"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              christianphilie
            </a>
          </p>
          <p>{t("footerDataLocal")}</p>
        </div>
      </footer>
    </div>
  );
}
