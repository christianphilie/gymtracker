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
  doneAndReady: boolean;
}

function HeaderActions({ sessionState }: { sessionState: SessionHeaderState | null }) {
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
    return (
      <div className="w-[118px] space-y-1">
        <p className="text-right text-xs font-medium">
          {sessionState.completed}/{sessionState.total} {t("sets")}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full border bg-secondary">
          <div className="h-full bg-primary" style={{ width: `${donePercent}%` }} />
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
  useEffect(() => {
    if (!sessionMeta) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionMeta]);

  const sessionState = useMemo<SessionHeaderState | null>(() => {
    if (!sessionMeta) {
      return null;
    }

    const elapsedSeconds = sessionMeta.sinceIso
      ? Math.max(0, Math.floor((now - new Date(sessionMeta.sinceIso).getTime()) / 1000))
      : 0;
    return {
      sessionId: sessionMeta.sessionId,
      total: sessionMeta.total,
      completed: sessionMeta.completed,
      elapsedSeconds,
      doneAndReady: sessionMeta.total > 0 && sessionMeta.completed === sessionMeta.total
    };
  }, [sessionMeta, now]);

  const timerProgress = Math.min(sessionState?.elapsedSeconds ?? 0, restTimerSeconds) / restTimerSeconds;
  const timerExceeded = (sessionState?.elapsedSeconds ?? 0) >= restTimerSeconds;
  const timerDegrees = timerExceeded ? 360 : Math.round(timerProgress * 360);
  const timerRingColor = timerExceeded ? "#ef4444" : "#f59e0b";

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background">
      <header className="sticky top-0 z-20 border-x-0 border-b border-t-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Dumbbell className="h-4 w-4" />
            {t("appName")}
          </Link>
          <HeaderActions sessionState={sessionState} />
        </div>
      </header>

      {sessionState && !sessionState.doneAndReady && sessionState.elapsedSeconds > 0 && (
        <div className="pointer-events-none fixed right-4 top-[4.25rem] z-30">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full p-[5px] shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
            style={{
              background: `conic-gradient(${timerRingColor} ${timerDegrees}deg, hsl(var(--secondary)) 0deg)`
            }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-[8px] font-medium">
              {formatDurationClock(sessionState.elapsedSeconds)}
            </div>
          </div>
        </div>
      )}

      <main className="container py-4 pb-6">
        <Outlet />
      </main>
    </div>
  );
}
