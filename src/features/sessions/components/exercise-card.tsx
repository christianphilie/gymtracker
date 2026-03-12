import type { RefCallback } from "react";
import { Check, GripVertical, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseInfoDialogButton } from "@/components/exercises/exercise-info-dialog-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetValueDisplay } from "@/components/weights/weight-display";
import type { ExerciseAiInfo, SessionExerciseSet } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import { addSessionSet, removeSessionSet } from "@/db/repository";
import { getSetRepsValue, getSetWeightValue } from "@/lib/utils";
import { SetRow } from "./set-row";
import { ExerciseNoteTag } from "./exercise-note-tag";

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
  lastSessionSets?: SessionExerciseSet[];
  weightUnitLabel: string;
  focusedWeightSetId: number | null;
  cardRef?: RefCallback<HTMLDivElement>;
  badgeRef: RefCallback<HTMLSpanElement>;
  t: (key: TranslationKey) => string;
  onToggleCollapse: () => void;
  onSetCompletedToggle: (set: SessionExerciseSet, completed: boolean) => Promise<void>;
  onFocusChange: (id: number | null) => void;
  onUpdateReps: (set: SessionExerciseSet, value: number) => Promise<void>;
  onUpdateWeight: (set: SessionExerciseSet, value: number) => void;
  onRequestDeleteExercise: (key: string) => void;
  reorderMode?: boolean;
  isDragging?: boolean;
}

export function ExerciseCard({
  exercise,
  sessionId,
  isCollapsed,
  showDoneBadge,
  sessionIsCompleted,
  lastSessionSets,
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
  onRequestDeleteExercise,
  reorderMode = false,
  isDragging = false
}: ExerciseCardProps) {
  const allCompleted = exercise.sets.length > 0 && exercise.sets.every((s) => s.completed);

  return (
    <Card
      ref={cardRef}
      className={`transition-all duration-200 ${isDragging ? "ring-2 ring-emerald-400/60" : ""} ${reorderMode ? "pointer-events-none" : ""}`}
    >
      <CardHeader className="space-y-2">
        <div className="flex min-h-5 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              className="flex min-w-0 max-w-full items-center gap-0.5 text-left"
              disabled={reorderMode}
              aria-label={isCollapsed ? t("expandExercise") : t("collapseExercise")}
              onClick={onToggleCollapse}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <CardTitle className="min-w-0 truncate text-left leading-tight">{exercise.exerciseName}</CardTitle>
            </button>
            <ExerciseInfoDialogButton
              exerciseName={exercise.exerciseName}
              aiInfo={exercise.exerciseAiInfo}
              className="shrink-0 self-center text-muted-foreground/70"
            />
          </div>
          <div className="flex items-center gap-1">
            {reorderMode && (
              <span
                aria-hidden
                className="inline-flex pointer-events-none items-center justify-center text-muted-foreground/70"
                title={t("reorderExercise")}
              >
                <GripVertical className="h-4 w-4 cursor-grab" />
              </span>
            )}
            {allCompleted && (
              <div className="flex items-center gap-1">
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
          </div>
        </div>

      </CardHeader>

      <div className={`grid transition-all duration-200 ${isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
        <div className="overflow-hidden">
          <CardContent className={`space-y-2 ${exercise.x2Enabled ? "pt-1" : ""}`}>
            {exercise.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                x2Enabled={exercise.x2Enabled}
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

            {(exercise.exerciseNotes || (lastSessionSets && lastSessionSets.length > 0) || !sessionIsCompleted) && (
              <div className="border-t pt-2">
                <div className="flex items-center gap-2">
                  {lastSessionSets && lastSessionSets.length > 0 ? (
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-muted-foreground/70" aria-label={t("lastSession")} />
                        {lastSessionSets.map((summarySet, index) => (
                          <span
                            key={summarySet.id ?? `${exercise.sessionExerciseKey}-${index}`}
                            className="inline-flex rounded-full border border-border/80 bg-transparent px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground/70"
                          >
                            <SetValueDisplay
                              reps={getSetRepsValue(summarySet)}
                              weight={getSetWeightValue(summarySet)}
                              weightUnitLabel={weightUnitLabel}
                              iconClassName="text-muted-foreground/70"
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : exercise.exerciseNotes ? (
                    <div className="min-w-0 flex-1">
                      <ExerciseNoteTag note={exercise.exerciseNotes} className="align-middle" />
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1" />
                  )}
                  {!sessionIsCompleted && (
                    <div className="ml-auto flex shrink-0 items-center gap-2">
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
                </div>
                {lastSessionSets && lastSessionSets.length > 0 && exercise.exerciseNotes && (
                  <div className="pt-1.5">
                    <ExerciseNoteTag note={exercise.exerciseNotes} className="align-middle" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
