import { Link, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Dumbbell, Import, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/app/settings-context";
import { db } from "@/db/db";

function HeaderActions() {
  const location = useLocation();
  const { t } = useSettings();
  const sessionMatch = location.pathname.match(/^\/sessions\/(\d+)$/);
  const activeSessionId = sessionMatch ? Number(sessionMatch[1]) : null;

  const sessionProgress = useLiveQuery(async () => {
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

    return { total, completed };
  }, [activeSessionId]);

  if (sessionProgress) {
    const donePercent =
      sessionProgress.total > 0 ? Math.round((sessionProgress.completed / sessionProgress.total) * 100) : 0;

    return (
      <div className="w-[118px] space-y-1">
        <p className="text-right text-xs font-medium">
          {sessionProgress.completed}/{sessionProgress.total}
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
  const { t } = useSettings();

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background">
      <header className="sticky top-0 z-20 border-x-0 border-b border-t-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Dumbbell className="h-4 w-4" />
            {t("appName")}
          </Link>
          <HeaderActions />
        </div>
      </header>

      <main className="container py-4 pb-6">
        <Outlet />
      </main>
    </div>
  );
}
