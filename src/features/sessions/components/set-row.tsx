import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/forms/decimal-input";
import type { SessionExerciseSet } from "@/db/types";
import { WeightInput } from "./weight-input";

interface SetRowProps {
  set: SessionExerciseSet;
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
  const actualReps = set.actualReps ?? set.targetReps;
  const actualWeight = set.actualWeight ?? set.targetWeight;
  const showRepsHint = actualReps !== set.targetReps;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 py-1">
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
          <div className={`pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground ${set.completed ? "opacity-50" : ""}`}>
            {showRepsHint && <span className="line-through">{set.targetReps}</span>}
            <span>×</span>
          </div>
        </div>
      </div>

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
          onFocusChange={onFocusChange}
          onCommit={onUpdateWeight}
        />
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
