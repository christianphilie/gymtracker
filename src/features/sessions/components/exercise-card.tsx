import type { RefCallback } from "react";
import { Check, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import { addSessionSet, removeSessionSet } from "@/db/repository";
import { SetRow } from "./set-row";

const SUCCESS_CIRCLE_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-500 dark:bg-emerald-800 dark:text-emerald-100";

export interface SessionExercise {
  sessionExerciseKey: string;
  sets: SessionExerciseSet[];
  exerciseName: string;
  exerciseNotes?: string | null;
  exerciseOrder: number;
  isTemplateExercise: boolean;
  templateExerciseId?: number;
  x2Enabled: boolean;
  negativeWeightEnabled: boolean;
  exerciseAiInfo?: ExerciseAiInfo;
}

interface ExerciseCardProps {
  exercise: SessionExercise;
  sessionId: number;
  isCollapsed: boolean;
  showDoneBadge: boolean;
  sessionIsCompleted: boolean;
  lastSessionSetSummary?: string;
  weightUnitLabel: string;
  focusedWeightSetId: number | null;
  cardRef: RefCallback<HTMLDivElement>;
  badgeRef: RefCallback<HTMLSpanElement>;
  t: (key: TranslationKey) => string;
  onToggleCollapse: () => void;
  onSetCompletedToggle: (set: SessionExerciseSet, completed: boolean) => Promise<void>;
  onFocusChange: (id: number | null) => void;
  onUpdateReps: (set: SessionExerciseSet, value: number) => Promise<void>;
  onUpdateWeight: (set: SessionExerciseSet, value: number) => void;
  onRequestDeleteExercise: (key: string) => void;
}

export function ExerciseCard({
  exercise,
  sessionId,
  isCollapsed,
  showDoneBadge,
  sessionIsCompleted,
  lastSessionSetSummary,
  weightUnitLabel,
  focusedWeightSetId,
  cardRef,
  badgeRef,
  t,
  onToggleCollapse,
  onSetCompletedToggle,
  onFocusChange,
  onUpdateReps,
  onUpdateWeight,
  onRequestDeleteExercise
}: ExerciseCardProps) {
  const allCompleted = exercise.sets.length > 0 && exercise.sets.every((s) => s.completed);

  return (
    <Card ref={cardRef} className="transition-all duration-200">
      <CardHeader className="space-y-2">
        <div className="flex min-h-5 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-0.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-0.5 text-left"
              aria-label={isCollapsed ? t("expandExercise") : t("collapseExercise")}
              onClick={onToggleCollapse}
            >
              <svg
                viewBox="0 0 24 24"
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <CardTitle className="min-w-0 flex-1 text-left leading-tight">{exercise.exerciseName}</CardTitle>
            </button>
            {exercise.x2Enabled && (
              <span className="ml-1 rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                ×2
              </span>
            )}
          </div>
          {allCompleted && (
            <div className="flex items-center gap-1">
              {sessionIsCompleted && (
                <ExerciseInfoDialogButton
                  exerciseName={exercise.exerciseName}
                  aiInfo={exercise.exerciseAiInfo}
                />
              )}
              <span
                ref={badgeRef}
                className={`${SUCCESS_CIRCLE_CLASS} transition-all duration-200 ease-out ${
                  showDoneBadge ? "scale-100 opacity-100" : "pointer-events-none scale-50 opacity-0"
                }`}
                aria-label={t("done")}
              >
                <Check className="h-3 w-3" />
              </span>
            </div>
          )}
          {!allCompleted && sessionIsCompleted && (
            <ExerciseInfoDialogButton exerciseName={exercise.exerciseName} aiInfo={exercise.exerciseAiInfo} />
          )}
        </div>

        {lastSessionSetSummary && (
          <p className="text-xs text-muted-foreground">
            {t("lastSession")}: {lastSessionSetSummary}
          </p>
        )}
      </CardHeader>

      <div className={`grid transition-all duration-200 ${isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
        <div className="overflow-hidden">
          {exercise.exerciseNotes && (
            <div className="px-6 pb-2">
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <NotebookPen className="h-3 w-3 shrink-0" />
                <span>{exercise.exerciseNotes}</span>
              </p>
            </div>
          )}
          <CardContent className="space-y-2">
            {exercise.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                negativeWeightEnabled={exercise.negativeWeightEnabled}
                sessionIsCompleted={sessionIsCompleted}
                weightUnitLabel={weightUnitLabel}
                focusedWeightSetId={focusedWeightSetId}
                onFocusChange={onFocusChange}
                onToggleComplete={(completed) => onSetCompletedToggle(set, completed)}
                onUpdateReps={(value) => onUpdateReps(set, value)}
                onUpdateWeight={(value) => onUpdateWeight(set, value)}
                doneAriaLabel={t("done")}
              />
            ))}

            {!sessionIsCompleted && (
              <div className="flex items-center gap-2 border-t pt-2">
                <ExerciseInfoDialogButton
                  exerciseName={exercise.exerciseName}
                  aiInfo={exercise.exerciseAiInfo}
                  className="h-8 w-8 rounded-md text-muted-foreground/70"
                />
                <div className="flex-1" />
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                  aria-label={t("removeExercise")}
                  onClick={async () => {
                    const sorted = [...exercise.sets].sort((a, b) => b.templateSetOrder - a.templateSetOrder);
                    if (sorted.length > 1) {
                      await removeSessionSet(sorted[0].id!);
                      return;
                    }
                    onRequestDeleteExercise(exercise.sessionExerciseKey);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-md text-lg leading-none"
                  onClick={async () => {
                    await addSessionSet(sessionId, exercise.sessionExerciseKey);
                  }}
                  aria-label={t("addSet")}
                >
                  +
                </Button>
              </div>
            )}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
