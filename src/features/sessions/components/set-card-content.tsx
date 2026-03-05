import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import type { SessionExerciseSet } from "@/db/types";
import { ExerciseNoteTag } from "./exercise-note-tag";

export type SetCardVariant = "colored" | "neutral" | "neutral-muted";

interface SetCardContentProps {
  exercise: {
    exerciseName: string;
    exerciseNotes?: string | null;
    sets: SessionExerciseSet[];
  };
  set: SessionExerciseSet;
  variant?: SetCardVariant;
  compact?: boolean;
  previewOnly?: boolean;
  hideButton?: boolean;
  weightUnitLabel: string;
  onDone?: () => void;
  doneAriaLabel: string;
}

export function SetCardContent({
  exercise,
  set,
  variant = "colored",
  compact = false,
  previewOnly = false,
  hideButton = false,
  weightUnitLabel,
  onDone,
  doneAriaLabel
}: SetCardContentProps) {
  const repsValue = set.actualReps ?? set.targetReps;
  const weightValue = set.actualWeight ?? set.targetWeight;

  const index = exercise.sets.findIndex((s) => s.id === set.id);
  const setPositionLabel = index >= 0 ? `${index + 1}/${exercise.sets.length}` : "";

  const isMuted = variant === "neutral-muted";
  const isNeutral = variant !== "colored";

  const titleClass = compact ? "text-sm" : "text-[15px]";
  const metaClass = compact ? "text-[11px]" : "text-xs";
  const valueClass = compact ? "text-xs" : "text-sm";
  const mainColorClass = isMuted ? "text-foreground/55" : "";
  const metaColorClass = isMuted ? "text-foreground/40" : "opacity-80";
  const valueColorClass = isMuted ? "text-foreground/50" : "";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className={`${titleClass} overflow-hidden whitespace-nowrap font-semibold leading-tight ${mainColorClass}`}>
          <span>{exercise.exerciseName}</span>
        </p>
        {!previewOnly && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className={`${valueClass} font-normal tabular-nums ${valueColorClass}`}>
              {repsValue} × {formatNumber(weightValue, 0)} {weightUnitLabel}
              {setPositionLabel && <span className={`opacity-75 ${metaClass}`}> · {setPositionLabel}</span>}
            </p>
            {exercise.exerciseNotes && (
              <ExerciseNoteTag
                note={exercise.exerciseNotes}
                className={`${isMuted ? "border-zinc-300/70 text-zinc-500" : ""} ${compact ? "px-2 py-1 text-[10px]" : ""} ${metaColorClass}`}
              />
            )}
          </div>
        )}
      </div>
      {!previewOnly && !hideButton && (
        <Button
          type="button"
          size="icon"
          onClick={onDone}
          disabled={!set.id}
          aria-label={doneAriaLabel}
          className={`shrink-0 self-center rounded-full ${
            isNeutral
              ? "border border-input bg-background text-foreground hover:bg-secondary"
              : "border border-white/20 bg-white/15 text-white hover:bg-white/25"
          } ${compact ? "h-9 w-9" : "h-10 w-10"}`}
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
