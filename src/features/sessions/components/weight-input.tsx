import { PersonStanding } from "lucide-react";
import { DecimalInput } from "@/components/forms/decimal-input";

interface WeightInputProps {
  value: number;
  negativeWeightEnabled: boolean;
  disabled?: boolean;
  completed?: boolean;
  targetWeight?: number;
  weightUnitLabel: string;
  focusedSetId: number | null;
  setId: number | undefined;
  onFocusChange: (id: number | null) => void;
  onCommit: (value: number) => void;
}

function WeightLabel({ w }: { w: number }) {
  if (w === 0) return <PersonStanding className="h-4 w-4 shrink-0" />;
  if (w < 0) return (
    <>
      <PersonStanding className="h-4 w-4 shrink-0" />
      <span>−{-w}</span>
    </>
  );
  return <span>{w}</span>;
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
  const isBw = value === 0;
  const isNeg = value < 0;
  const showOverlay = (isBw || isNeg) && focusedSetId !== setId && !completed;
  const showTargetHint = targetWeight !== undefined && value !== targetWeight;

  return (
    <div className="relative">
      <DecimalInput
        value={isNeg ? -value : value}
        min={0}
        step={0.5}
        disabled={disabled}
        className={`pr-16 ${completed ? "border-muted bg-muted/70 text-muted-foreground opacity-75" : ""} ${showOverlay ? "pl-7 text-transparent" : ""}`}
        onFocus={() => onFocusChange(setId ?? null)}
        onBlur={() => onFocusChange(null)}
        onCommit={(v) => onCommit(negativeWeightEnabled ? -Math.abs(v) : v)}
      />
      {showOverlay && (
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center gap-0.5 text-sm text-foreground">
          <WeightLabel w={value} />
        </div>
      )}
      <div className={`pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-base text-muted-foreground ${completed ? "opacity-50" : ""}`}>
        {showTargetHint && (
          <span className="inline-flex items-center gap-0.5 line-through">
            <WeightLabel w={targetWeight!} />
          </span>
        )}
        <span>{weightUnitLabel}</span>
      </div>
    </div>
  );
}
