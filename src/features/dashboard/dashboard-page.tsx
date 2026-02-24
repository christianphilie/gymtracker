import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChartNoAxesCombined, Download, Dumbbell, OctagonX, PenSquare, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { db } from "@/db/db";
import { discardSession, ensureDefaultWorkout, startSession } from "@/db/repository";
import type { SessionExerciseSet } from "@/db/types";
import { useSettings } from "@/app/settings-context";
import {
  estimateStrengthTrainingCalories,
  getSessionDurationMinutes,
  resolveCaloriesBodyWeightKg
} from "@/lib/calorie-estimation";
import { formatNumber, formatSessionDateLabel, getSetStatsMultiplier } from "@/lib/utils";

interface WorkoutListItem {
  id?: number;
  name: string;
  exerciseCount: number;
  lastSessionAt?: string;
  activeSessionId?: number;
  activeSessionStartedAt?: string;
  sortTimestamp: number;
}

interface WeeklyStatsWorkoutEntry {
  sessionId: number;
  workoutId: number;
  workoutName: string;
  weekdayLabel: string;
}

interface WeeklyDashboardStats {
  workoutCount: number;
  exerciseCount: number;
  setCount: number;
  repsTotal: number;
  totalWeight: number;
  caloriesTotal: number | null;
  usesDefaultBodyWeightForCalories: boolean;
  completedWorkouts: WeeklyStatsWorkoutEntry[];
}

const ACTIVE_SESSION_PILL_CLASS = "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700";
const EMPTY_WEEKLY_STATS: WeeklyDashboardStats = {
  workoutCount: 0,
  exerciseCount: 0,
  setCount: 0,
  repsTotal: 0,
  totalWeight: 0,
  caloriesTotal: null,
  usesDefaultBodyWeightForCalories: false,
  completedWorkouts: []
};

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
  return <DashboardPageContent section="workouts" />;
}

export function StatisticsPage() {
  return <DashboardPageContent section="statistics" />;
}

function DashboardPageContent({ section }: { section: "workouts" | "statistics" }) {
  const { t, language, weightUnit } = useSettings();
  const navigate = useNavigate();
  const weekStart = useMemo(() => getWeekStart(new Date()), []);
  const [discardConfirmSessionId, setDiscardConfirmSessionId] = useState<number | null>(null);
  const [isCreatingStarterWorkout, setIsCreatingStarterWorkout] = useState(false);

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
    const activeSessions = sessions
      .filter((session): session is typeof session & { id: number } => session.status === "active" && session.id !== undefined)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const primaryActiveSession = activeSessions[0];
    const primaryActiveSessionId = primaryActiveSession?.id;
    const activeSessionByWorkout = new Map<number, { id: number; startedAt: string }>();

    for (const session of sessions) {
      if (
        primaryActiveSessionId !== undefined &&
        session.status === "active" &&
        session.id === primaryActiveSessionId
      ) {
        activeSessionByWorkout.set(session.workoutId, {
          id: primaryActiveSessionId,
          startedAt: session.startedAt
        });
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

  const weeklyStats = useLiveQuery<WeeklyDashboardStats>(async () => {
    const completedSessions = (await db.sessions.where("status").equals("completed").toArray())
      .filter((session) => new Date(session.finishedAt ?? session.startedAt) >= weekStart)
      .sort(
        (a, b) =>
          new Date(a.finishedAt ?? a.startedAt).getTime() - new Date(b.finishedAt ?? b.startedAt).getTime()
      );

    if (completedSessions.length === 0) {
      return EMPTY_WEEKLY_STATS;
    }

    const sessionIds = completedSessions.map((session) => session.id).filter((id): id is number => id !== undefined);
    const workoutIds = [...new Set(completedSessions.map((session) => session.workoutId))];

    const [allSets, workoutsForStats, settings] = await Promise.all([
      sessionIds.length ? db.sessionExerciseSets.where("sessionId").anyOf(sessionIds).toArray() : [],
      workoutIds.length ? db.workouts.where("id").anyOf(workoutIds).toArray() : [],
      db.settings.get(1)
    ]);

    const setsBySessionId = new Map<number, SessionExerciseSet[]>();
    for (const set of allSets) {
      const current = setsBySessionId.get(set.sessionId) ?? [];
      current.push(set);
      setsBySessionId.set(set.sessionId, current);
    }

    const workoutNameById = new Map<number, string>();
    for (const workout of workoutsForStats) {
      if (workout.id !== undefined) {
        workoutNameById.set(workout.id, workout.name);
      }
    }

    const weekdayFormatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      weekday: "long"
    });

    let exerciseCount = 0;
    let setCount = 0;
    let repsTotal = 0;
    let totalWeight = 0;
    let caloriesTotal = 0;
    const { bodyWeightKg, usesDefaultBodyWeight } = resolveCaloriesBodyWeightKg(settings?.bodyWeight, weightUnit);

    const completedWorkouts = completedSessions.map((session) => {
      const sessionId = session.id ?? -1;
      const sessionSets = setsBySessionId.get(sessionId) ?? [];
      const completedSets = sessionSets.filter((set) => set.completed);
      const setsForExerciseCount = completedSets.length > 0 ? completedSets : sessionSets;
      const weightedCompletedSetCount = completedSets.reduce((sum, set) => sum + getSetStatsMultiplier(set), 0);
      const sessionRepsTotal = completedSets.reduce(
        (sum, set) => sum + (set.actualReps ?? set.targetReps) * getSetStatsMultiplier(set),
        0
      );
      const sessionTotalWeight = completedSets.reduce(
        (sum, set) =>
          sum +
          (set.actualWeight ?? set.targetWeight) *
            (set.actualReps ?? set.targetReps) *
            getSetStatsMultiplier(set),
        0
      );

      exerciseCount += new Set(setsForExerciseCount.map((set) => set.sessionExerciseKey)).size;
      setCount += weightedCompletedSetCount;
      repsTotal += sessionRepsTotal;
      totalWeight += sessionTotalWeight;

      const durationMinutes = getSessionDurationMinutes(session.startedAt, session.finishedAt);
      caloriesTotal += estimateStrengthTrainingCalories({
        durationMinutes,
        bodyWeightKg,
        completedSetCount: weightedCompletedSetCount,
        repsTotal: sessionRepsTotal
      });

      const completedAt = new Date(session.finishedAt ?? session.startedAt);
      return {
        sessionId,
        workoutId: session.workoutId,
        workoutName: workoutNameById.get(session.workoutId) ?? "-",
        weekdayLabel: weekdayFormatter.format(completedAt)
      };
    });

    return {
      workoutCount: completedSessions.length,
      exerciseCount,
      setCount,
      repsTotal,
      totalWeight,
      caloriesTotal,
      usesDefaultBodyWeightForCalories: usesDefaultBodyWeight,
      completedWorkouts
    };
  }, [language, weekStart, weightUnit]);

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

  const renderWorkoutCard = (workout: WorkoutListItem) => {
    const isActive = !!workout.activeSessionId;
    const disableStartBecauseOtherActive = hasActiveWorkout && !isActive;

    return (
      <Card key={workout.id}>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>{workout.name}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {workout.exerciseCount} {t("exercises")}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            {isActive ? (
              <>
                <span className={ACTIVE_SESSION_PILL_CLASS}>
                  {t("activeSession")}
                </span>
                <p className="pr-2 text-xs text-muted-foreground">
                  {t("since")}{" "}
                  {workout.activeSessionStartedAt ? formatSessionDateLabel(workout.activeSessionStartedAt, language) : "-"}
                </p>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                <p>{t("lastSession")}</p>
                <p>{workout.lastSessionAt ? formatSessionDateLabel(workout.lastSessionAt, language) : "-"}</p>
              </div>
            )}
          </div>
        </CardHeader>

        <CardFooter className="justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("sessionHistory")}
              onClick={() => navigate(`/workouts/${workout.id}/history`)}
            >
              <ChartNoAxesCombined className="h-4 w-4" />
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
          <div className="flex items-center gap-2">
            {isActive && (
              <Button
                variant="outline"
                size="icon"
                aria-label={t("discardSession")}
                onClick={() => {
                  if (workout.activeSessionId) {
                    setDiscardConfirmSessionId(workout.activeSessionId);
                  }
                }}
              >
                <OctagonX className="h-4 w-4" />
              </Button>
            )}
            <Button
              className={isActive ? "bg-emerald-600 text-white hover:bg-emerald-700" : undefined}
              disabled={disableStartBecauseOtherActive}
              onClick={() => handleStartSession(workout.id!)}
            >
              <PlayFilledIcon className={`mr-2 shrink-0 ${isActive ? "h-[1.375rem] w-[1.375rem]" : "h-[1.125rem] w-[1.125rem]"}`} />
              {isActive ? t("resumeSession") : t("startSession")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    );
  };

  return (
    <section className="space-y-4">
      <p className="text-base font-semibold leading-tight text-foreground/75">
        {showWorkoutsSection ? t("workouts") : t("statisticsThisWeekSubtitle")}
      </p>

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
            onClick={() => navigate("/settings")}
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
          {activeWorkouts.map(renderWorkoutCard)}
        </div>
      )}

      {showWorkoutsSection && activeWorkouts.length > 0 && inactiveWorkouts.length > 0 && <div className="h-px bg-border" />}

      {showWorkoutsSection && inactiveWorkouts.length > 0 && (
        <div className="space-y-3">
          {activeWorkouts.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">{t("otherWorkouts")}</p>
          )}
          {inactiveWorkouts.map(renderWorkoutCard)}
        </div>
      )}

      {showWorkoutsSection && hasWorkouts && (
        <>
          <Button
            variant="secondary"
            className="w-full justify-start gap-2"
            onClick={() => navigate("/workouts/add")}
          >
            <Plus className="h-4 w-4" />
            {t("addWorkout")}
          </Button>
        </>
      )}

      {showStatsSection && (
        <section className="space-y-3">
          <Card>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("workoutsThisWeek")}</p>
                  <p className="text-base font-semibold">{weeklyStats?.workoutCount ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("exercises")}</p>
                  <p className="text-base font-semibold">{weeklyStats?.exerciseCount ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("sets")}</p>
                  <p className="text-base font-semibold">{weeklyStats?.setCount ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("repsTotal")}</p>
                  <p className="text-base font-semibold">{weeklyStats?.repsTotal ?? 0}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("totalWeight")}</p>
                  <p className="text-base font-semibold">
                    {formatNumber(weeklyStats?.totalWeight ?? 0, 0)} {weightUnit}
                  </p>
                </div>
                <div className="relative rounded-lg border bg-card px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{t("calories")}</p>
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

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("completedWorkoutsThisWeek")}</p>
                {(weeklyStats?.completedWorkouts.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {weeklyStats?.completedWorkouts.map((item) => (
                      <Link
                        key={item.sessionId}
                        to={`/workouts/${item.workoutId}/history#session-${item.sessionId}`}
                        className="rounded-xl border bg-background px-3 py-2 transition-colors hover:bg-secondary"
                      >
                        <p className="text-sm font-medium leading-none">{item.workoutName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.weekdayLabel}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noWorkoutsThisWeek")}</p>
                )}
              </div>
            </CardContent>
          </Card>
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
