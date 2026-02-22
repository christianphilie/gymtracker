import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Dumbbell, History, PenSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/db";
import { discardSession, startSession } from "@/db/repository";
import { useSettings } from "@/app/settings-context";
import { formatDateTime } from "@/lib/utils";

interface WorkoutListItem {
  id?: number;
  name: string;
  exerciseCount: number;
  lastSessionAt?: string;
  activeSessionId?: number;
  activeSessionStartedAt?: string;
  sortTimestamp: number;
}

function getWeekStart(date: Date) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + diff);
  return target;
}

function PlayFilledIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 6v12l10-6z" fill="currentColor" />
    </svg>
  );
}

export function DashboardPage() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const weekStart = useMemo(() => getWeekStart(new Date()), []);

  const workouts = useLiveQuery(async () => {
    const list = await db.workouts.toArray();
    const workoutIds = list.map((workout) => workout.id).filter((id): id is number => !!id);

    const [exercises, sessions] = await Promise.all([
      workoutIds.length
        ? db.exercises
            .where("workoutId")
            .anyOf(workoutIds)
            .and((exercise) => exercise.isTemplate !== false)
            .toArray()
        : [],
      workoutIds.length ? db.sessions.where("workoutId").anyOf(workoutIds).toArray() : []
    ]);

    const exerciseCountByWorkout = new Map<number, number>();
    for (const exercise of exercises) {
      exerciseCountByWorkout.set(exercise.workoutId, (exerciseCountByWorkout.get(exercise.workoutId) ?? 0) + 1);
    }

    const lastSessionByWorkout = new Map<number, string>();
    const activeSessionByWorkout = new Map<number, { id: number; startedAt: string }>();

    for (const session of sessions) {
      if (session.status === "active" && session.id) {
        const existingActive = activeSessionByWorkout.get(session.workoutId);
        const timestamp = new Date(session.startedAt).getTime();
        if (!existingActive || timestamp < new Date(existingActive.startedAt).getTime()) {
          activeSessionByWorkout.set(session.workoutId, {
            id: session.id,
            startedAt: session.startedAt
          });
        }
      }

      if (session.status === "completed") {
        const timestamp = session.finishedAt ?? session.startedAt;
        const existing = lastSessionByWorkout.get(session.workoutId);

        if (!existing || new Date(timestamp).getTime() > new Date(existing).getTime()) {
          lastSessionByWorkout.set(session.workoutId, timestamp);
        }
      }
    }

    return list.map<WorkoutListItem>((workout) => {
      const lastSessionAt = workout.id ? lastSessionByWorkout.get(workout.id) : undefined;
      const activeSession = workout.id ? activeSessionByWorkout.get(workout.id) : undefined;

      return {
        ...workout,
        exerciseCount: exerciseCountByWorkout.get(workout.id ?? -1) ?? 0,
        lastSessionAt,
        activeSessionId: activeSession?.id,
        activeSessionStartedAt: activeSession?.startedAt,
        sortTimestamp: lastSessionAt ? new Date(lastSessionAt).getTime() : -Infinity
      };
    });
  }, []);

  const completedThisWeek = useLiveQuery(async () => {
    const sessions = await db.sessions.where("status").equals("completed").toArray();
    return sessions.filter((session) => new Date(session.finishedAt ?? session.startedAt) >= weekStart).length;
  }, [weekStart]);

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

    return {
      activeWorkouts: active,
      inactiveWorkouts: inactive
    };
  }, [workouts]);

  const hasWorkouts = useMemo(() => (workouts?.length ?? 0) > 0, [workouts]);

  const handleStartSession = async (workoutId: number) => {
    try {
      const sessionId = await startSession(workoutId);
      navigate(`/sessions/${sessionId}`);
    } catch {
      toast.error("Session start failed");
    }
  };

  const renderWorkoutCard = (workout: WorkoutListItem) => {
    const isActive = !!workout.activeSessionId;

    return (
      <Card key={workout.id}>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>{workout.name}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {workout.exerciseCount} {t("exercises")}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isActive ? (
              <>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {t("activeSession")}
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/70 hover:text-foreground"
                  aria-label={t("discardSession")}
                  onClick={async () => {
                    if (!workout.activeSessionId) {
                      return;
                    }
                    try {
                      await discardSession(workout.activeSessionId);
                      toast.success(t("sessionDiscarded"));
                    } catch {
                      toast.error("Action failed");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="text-right text-xs text-muted-foreground">
                <p>{t("lastSession")}</p>
                <p>{workout.lastSessionAt ? formatDateTime(workout.lastSessionAt) : "-"}</p>
              </div>
            )}
          </div>
        </CardHeader>

        {isActive && (
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {t("sessionStartedAt")}: {workout.activeSessionStartedAt ? formatDateTime(workout.activeSessionStartedAt) : "-"}
          </CardContent>
        )}

        <CardFooter className="justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("sessionHistory")}
              onClick={() => navigate(`/workouts/${workout.id}/history`)}
            >
              <History className="h-4 w-4" />
            </Button>
            {!isActive && (
              <Button
                variant="outline"
                size="icon"
                aria-label={t("edit")}
                onClick={() => navigate(`/workouts/${workout.id}/edit`)}
              >
                <PenSquare className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            className={isActive ? "bg-emerald-600 text-white hover:bg-emerald-700" : undefined}
            onClick={() => handleStartSession(workout.id!)}
          >
            <PlayFilledIcon className="mr-2 h-4 w-4" />
            {isActive ? t("resumeSession") : t("startSession")}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="inline-flex items-center gap-2 text-base font-semibold">
          <Dumbbell className="h-4 w-4" />
          {t("workouts")}
        </h1>
        <p className="text-xs text-muted-foreground">
          {t("completedThisWeek")}: {completedThisWeek ?? 0}
        </p>
      </div>

      {!hasWorkouts && (
        <Card>
          <CardHeader>
            <CardTitle>{t("noWorkouts")}</CardTitle>
          </CardHeader>
          <CardFooter className="gap-2">
            <Button onClick={() => navigate("/workouts/new")}>{t("createWorkout")}</Button>
            <Button variant="outline" onClick={() => navigate("/import")}>
              {t("openImport")}
            </Button>
          </CardFooter>
        </Card>
      )}

      {activeWorkouts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t("activeSessions")}</p>
          {activeWorkouts.map(renderWorkoutCard)}
        </div>
      )}

      {activeWorkouts.length > 0 && inactiveWorkouts.length > 0 && <div className="h-px bg-border" />}

      {inactiveWorkouts.length > 0 && (
        <div className="space-y-3">
          {activeWorkouts.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">{t("otherWorkouts")}</p>
          )}
          {inactiveWorkouts.map(renderWorkoutCard)}
        </div>
      )}

      {hasWorkouts && (
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => navigate("/workouts/new")}
        >
          <Plus className="h-4 w-4" />
          {t("addWorkout")}
        </Button>
      )}
    </section>
  );
}
