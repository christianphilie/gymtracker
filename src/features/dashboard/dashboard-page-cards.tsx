import type { ReactNode } from "react";
import { ChartNoAxesCombined, OctagonX, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutNameLabel } from "@/components/workouts/workout-name-label";
import type { Workout } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import { formatSessionDateLabel } from "@/lib/utils";

const ACTIVE_SESSION_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";
const RECOMMENDED_PILL_CLASS =
  "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-500 dark:bg-emerald-950 dark:text-emerald-200";

function PlayFilledIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 6v12l10-6z" fill="currentColor" />
    </svg>
  );
}

function formatCompactDateTimeLabel(value: string, language: "de" | "en") {
  const label = formatSessionDateLabel(value, language);
  if (/, \d{1,2}:\d{2}$/.test(label)) {
    return label;
  }
  return label.replace(/^(.+?)\s(\d{1,2}:\d{2})$/, "$1, $2");
}

export interface WorkoutListItem {
  id?: number;
  name: string;
  icon?: Workout["icon"];
  exerciseCount: number;
  estimatedDurationMinutes: number;
  lastSessionAt?: string;
  activeSessionId?: number;
  activeSessionStartedAt?: string;
  sortTimestamp: number;
}

export interface WeeklyGoalCardData {
  key: "workouts" | "duration" | "calories" | "weight";
  label: string;
  currentLabel: string;
  targetLabel: string;
  progressPercent: number;
  isComplete: boolean;
  icon: ReactNode;
}

interface WeeklyGoalCardProps {
  goal: WeeklyGoalCardData;
  compact?: boolean;
}

interface WorkoutListCardProps {
  workout: WorkoutListItem;
  hasActiveWorkout: boolean;
  recommendedWorkoutId: number | null;
  language: "de" | "en";
  t: (key: TranslationKey) => string;
  onOpenHistory: (workoutId: number) => void;
  onEditWorkout: (workoutId: number) => void;
  onDiscardActiveSession: (sessionId: number) => void;
  onStartOrResume: (workoutId: number) => void;
}

export function WeeklyGoalCard({ goal, compact = false }: WeeklyGoalCardProps) {
  return (
    <div className={`rounded-md border bg-card ${compact ? "px-2.5 py-2" : "px-2.5 py-2"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {goal.icon}
          {goal.label}
        </p>
        <p className="text-xs font-medium tabular-nums">
          {goal.currentLabel} / {goal.targetLabel}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${compact
            ? (goal.isComplete ? "bg-foreground" : "bg-foreground/75")
            : (goal.isComplete ? "bg-blue-500 dark:bg-blue-400" : "bg-blue-300 dark:bg-blue-700")}`}
          style={{ width: `${goal.progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export function WorkoutListCard({
  workout,
  hasActiveWorkout,
  recommendedWorkoutId,
  language,
  t,
  onOpenHistory,
  onEditWorkout,
  onDiscardActiveSession,
  onStartOrResume
}: WorkoutListCardProps) {
  const isActive = !!workout.activeSessionId;
  const disableStartBecauseOtherActive = hasActiveWorkout && !isActive;
  const isRecommended = !isActive && workout.id !== undefined && workout.id === recommendedWorkoutId;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>
            <WorkoutNameLabel name={workout.name} icon={workout.icon} />
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {workout.exerciseCount} {t("exercises")}
              {workout.estimatedDurationMinutes > 0 && (
                <>, {t("approxShort")} {workout.estimatedDurationMinutes} {t("minutesUnitLabel")}</>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 text-right">
          {isActive ? (
            <>
              <span className={ACTIVE_SESSION_PILL_CLASS}>{t("activeSession")}</span>
              <p className="pr-2 text-xs text-muted-foreground">
                {t("since")}{" "}
                {workout.activeSessionStartedAt ? formatSessionDateLabel(workout.activeSessionStartedAt, language) : "-"}
              </p>
            </>
          ) : (
            <>
              {isRecommended && (
                <span className={RECOMMENDED_PILL_CLASS}>
                  {t("recommended")}
                </span>
              )}
              <p className="pr-2 text-xs text-muted-foreground whitespace-nowrap">
                {t("lastSeen")}: {workout.lastSessionAt ? formatCompactDateTimeLabel(workout.lastSessionAt, language) : "-"}
              </p>
            </>
          )}
        </div>
      </CardHeader>

      <CardFooter className="justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("sessionHistory")}
            onClick={() => workout.id !== undefined && onOpenHistory(workout.id)}
          >
            <ChartNoAxesCombined className="h-4 w-4" />
          </Button>
          {!isActive && (
            <Button
              variant="outline"
              size="icon"
              aria-label={t("edit")}
              onClick={() => workout.id !== undefined && onEditWorkout(workout.id)}
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
              onClick={() => workout.activeSessionId && onDiscardActiveSession(workout.activeSessionId)}
            >
              <OctagonX className="h-4 w-4" />
            </Button>
          )}
          <Button
            className={
              isActive
                ? "bg-emerald-500 text-emerald-50 hover:bg-emerald-500/90 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
                : undefined
            }
            disabled={disableStartBecauseOtherActive}
            onClick={() => workout.id !== undefined && onStartOrResume(workout.id)}
          >
            <PlayFilledIcon
              className={`mr-2 shrink-0 ${isActive ? "h-[1.375rem] w-[1.375rem]" : "h-[1.125rem] w-[1.125rem]"}`}
            />
            {isActive ? t("resumeSession") : t("startSession")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
