import { PersonStanding } from "lucide-react";
import { cn, formatWeightValue } from "@/lib/utils";

interface WeightDisplayProps {
  weight: number | undefined;
  className?: string;
  iconClassName?: string;
}

export function WeightDisplay({ weight, className, iconClassName }: WeightDisplayProps) {
  if (weight === undefined || Number.isNaN(weight)) {
    return <span className={className}>-</span>;
  }

  if (weight === 0) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <PersonStanding className={cn("h-[1em] w-[1em] shrink-0", iconClassName)} />
      </span>
    );
  }

  if (weight < 0) {
    return (
      <span className={cn("inline-flex items-center gap-px", className)}>
        <PersonStanding className={cn("h-[1em] w-[1em] shrink-0", iconClassName)} />
        <span>−{formatWeightValue(Math.abs(weight))}</span>
      </span>
    );
  }

  return <span className={className}>{formatWeightValue(weight)}</span>;
}

interface SetValueDisplayProps {
  reps: number;
  weight: number | undefined;
  weightUnitLabel: string;
  className?: string;
  iconClassName?: string;
}

interface StruckWeightDisplayProps {
  weight: number | undefined;
  className?: string;
  iconClassName?: string;
}

export function SetValueDisplay({
  reps,
  weight,
  weightUnitLabel,
  className,
  iconClassName
}: SetValueDisplayProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{reps}</span>
      <span>×</span>
      <WeightDisplay weight={weight} iconClassName={iconClassName} />
      <span>{weightUnitLabel}</span>
    </span>
  );
}

export function StruckWeightDisplay({ weight, className, iconClassName }: StruckWeightDisplayProps) {
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-current" aria-hidden="true" />
      <WeightDisplay weight={weight} iconClassName={iconClassName} />
    </span>
  );
}
