import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/forms/decimal-input";
import { WeightInput } from "@/components/weights/weight-input";
import type { SessionExerciseSet } from "@/db/types";
import { getSetRepsValue, getSetWeightValue } from "@/lib/utils";

interface SetRowProps {
  set: SessionExerciseSet;
  x2Enabled: boolean;
  negativeWeightEnabled: boolean;
  sessionIsCompleted: boolean;
  weightUnitLabel: string;
  focusedWeightSetId: number | null;
  onFocusChange: (id: number | null) => void;
  onToggleComplete: (completed: boolean) => Promise<void>;
  onUpdateReps: (value: number) => Promise<void>;
  onUpdateWeight: (value: number) => void;
  doneAriaLabel: string;
}

export function SetRow({
  set,
  x2Enabled,
  negativeWeightEnabled,
  sessionIsCompleted,
  weightUnitLabel,
  focusedWeightSetId,
  onFocusChange,
  onToggleComplete,
  onUpdateReps,
  onUpdateWeight,
  doneAriaLabel
}: SetRowProps) {
  const actualReps = getSetRepsValue(set);
  const actualWeight = getSetWeightValue(set);
  const showRepsHint = actualReps !== set.targetReps;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-0.5">
      <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0">
          <div className="relative">
            <DecimalInput
              value={actualReps}
              min={0}
              step={1}
              disabled={sessionIsCompleted}
              className={`pr-14 ${set.completed ? "border-muted bg-muted/70 text-muted-foreground opacity-75" : ""}`}
              onCommit={onUpdateReps}
            />
            <div className={`pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center text-base text-muted-foreground ${set.completed ? "opacity-50" : ""}`}>
              {showRepsHint && <span className="shrink-0 line-through">{set.targetReps}</span>}
              <span className={showRepsHint ? "ml-1" : ""}>×</span>
            </div>
          </div>
        </div>

        {x2Enabled && (
          <span
            className={`pointer-events-none absolute left-1/2 top-1/2 z-10 inline-flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background text-[10px] font-medium leading-none text-muted-foreground shadow-sm ${
              set.completed ? "opacity-60" : ""
            }`}
          >
            2×
          </span>
        )}

        <div className="min-w-0">
          <WeightInput
            value={actualWeight}
            negativeWeightEnabled={negativeWeightEnabled}
            disabled={sessionIsCompleted}
            completed={set.completed}
            targetWeight={set.targetWeight}
            weightUnitLabel={weightUnitLabel}
            focusedSetId={focusedWeightSetId}
            setId={set.id}
            onFocusChange={(id) => onFocusChange(typeof id === "number" ? id : null)}
            onCommit={onUpdateWeight}
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button
          variant={set.completed ? "default" : "outline"}
          size="icon"
          className={`rounded-md ${
            set.completed
              ? "bg-emerald-500 text-white hover:bg-emerald-500/90 dark:bg-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-700"
              : ""
          }`}
          disabled={sessionIsCompleted}
          onClick={() => void onToggleComplete(!set.completed)}
          aria-label={doneAriaLabel}
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
