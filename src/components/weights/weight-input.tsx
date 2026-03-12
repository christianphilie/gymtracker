import { DecimalInput } from "@/components/forms/decimal-input";
import { StruckWeightDisplay, WeightDisplay } from "@/components/weights/weight-display";
import { getWeightInputValue, normalizeWeightInputValue } from "@/lib/utils";

interface WeightInputProps {
  value: number;
  negativeWeightEnabled: boolean;
  disabled?: boolean;
  completed?: boolean;
  targetWeight?: number;
  weightUnitLabel: string;
  focusedSetId: string | number | null;
  setId: string | number | undefined;
  onFocusChange: (id: string | number | null) => void;
  onCommit: (value: number) => void;
}

export function WeightInput({
  value,
  negativeWeightEnabled,
  disabled = false,
  completed = false,
  targetWeight,
  weightUnitLabel,
  focusedSetId,
  setId,
  onFocusChange,
  onCommit
}: WeightInputProps) {
  const isFocused = focusedSetId === setId;
  const showNegativePrefix = value !== 0 && (negativeWeightEnabled || value < 0);
  const showBodyweightOverlay = value === 0 && !isFocused;
  const showTargetHint = targetWeight !== undefined && value !== targetWeight;
  const inputRightPaddingClass = showTargetHint ? "pr-24" : "pr-14";
  const inputLeftPaddingClass = showBodyweightOverlay ? "pl-7 text-transparent" : showNegativePrefix ? "pl-9" : "";

  return (
    <div className="relative">
      <DecimalInput
        value={getWeightInputValue(value)}
        min={0}
        step={0.5}
        disabled={disabled}
        className={`${inputRightPaddingClass} ${inputLeftPaddingClass} ${completed ? "border-muted bg-muted/70 text-muted-foreground opacity-75" : ""}`}
        onFocus={() => onFocusChange(setId ?? null)}
        onBlur={() => onFocusChange(null)}
        onCommit={(nextValue) => onCommit(normalizeWeightInputValue(nextValue, negativeWeightEnabled))}
      />
      {showBodyweightOverlay && (
        <div className={`pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm ${completed ? "text-muted-foreground" : "text-foreground"}`}>
          <WeightDisplay weight={value} iconClassName={completed ? "text-muted-foreground" : undefined} />
        </div>
      )}
      {showNegativePrefix && (
        <div className={`pointer-events-none absolute inset-y-0 left-3 flex items-center gap-px text-sm ${completed ? "text-muted-foreground" : "text-foreground"}`}>
          <WeightDisplay weight={0} iconClassName={completed ? "text-muted-foreground" : undefined} />
          <span>−</span>
        </div>
      )}
      <div className={`pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground ${completed ? "opacity-50" : ""}`}>
        {showTargetHint && (
          <StruckWeightDisplay weight={targetWeight} />
        )}
        <span>{weightUnitLabel}</span>
      </div>
    </div>
  );
}
