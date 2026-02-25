import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Mountain,
  PersonStanding,
  Repeat,
  Shield,
  Shirt,
  Swords,
  Target,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type WorkoutIconKey } from "@/lib/workout-icons";

const workoutIconMap: Record<WorkoutIconKey, LucideIcon> = {
  dumbbell: Dumbbell,
  target: Target,
  flame: Flame,
  zap: Zap,
  "heart-pulse": HeartPulse,
  shield: Shield,
  footprints: Footprints,
  mountain: Mountain,
  activity: Activity,
  repeat: Repeat,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "arrow-right": ArrowRight,
  "arrow-left": ArrowLeft,
  "arrow-left-right": ArrowLeftRight,
  "chevrons-up": ChevronsUp,
  "chevrons-down": ChevronsDown,
  shirt: Shirt,
  "person-standing": PersonStanding,
  swords: Swords
};

export function WorkoutIconGlyph({
  icon,
  className
}: {
  icon?: WorkoutIconKey | null;
  className?: string;
}) {
  if (!icon) {
    return null;
  }

  const Icon = workoutIconMap[icon];
  if (!Icon) {
    return null;
  }

  return <Icon aria-hidden="true" className={cn("h-[1em] w-[1em] shrink-0", className)} />;
}

export function WorkoutNameLabel({
  name,
  icon,
  className,
  iconClassName,
  textClassName
}: {
  name: string;
  icon?: WorkoutIconKey | null;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-[0.45em]", className)}>
      <WorkoutIconGlyph icon={icon} className={cn("text-muted-foreground", iconClassName)} />
      <span className={cn("min-w-0", textClassName)}>{name}</span>
    </span>
  );
}
