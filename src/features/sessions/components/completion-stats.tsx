import type { ReactNode } from "react";
import { Clock3, Dumbbell, Flag, Flame, ListChecks, Repeat, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { formatNumber } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/translations";

function StatBox({
  icon,
  label,
  value,
  hint,
  boxClassName,
  labelClassName,
  valueClassName
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  boxClassName: string;
  labelClassName: string;
  valueClassName: string;
}) {
  return (
    <div className={boxClassName}>
      <div className="flex items-start justify-between gap-1">
        <p className={`inline-flex min-w-0 items-center gap-1 ${labelClassName}`}>{icon}{label}</p>
        {hint}
      </div>
      <p className={valueClassName}>{value}</p>
    </div>
  );
}

export interface CompletionStatsData {
  exerciseCount: number;
  setCount: number;
  repsTotal: number;
  totalWeight: number;
  calories: number;
  durationMinutes: number;
  usesDefaultBodyWeightForCalories: boolean;
}

interface CompletionStatsProps {
  stats: CompletionStatsData;
  weightUnit: string;
  durationLabel: string;
  t: (key: TranslationKey) => string;
  onComplete?: () => void;
  showCompleteAction?: boolean;
  variant?: "on-green" | "standalone";
}

export function CompletionStats({
  stats,
  weightUnit,
  durationLabel,
  t,
  onComplete,
  showCompleteAction = true,
  variant = "on-green"
}: CompletionStatsProps) {
  const isStandalone = variant === "standalone";
  const boxClassName = isStandalone
    ? "rounded-lg border border-emerald-300/50 bg-emerald-100/50 px-3 py-2 dark:border-emerald-800/50 dark:bg-emerald-900/25"
    : "rounded-md border border-white/15 bg-white/10 px-2 py-1";
  const labelClassName = isStandalone ? "text-xs text-emerald-800/80 dark:text-emerald-300/75" : "text-[10px] text-white/75";
  const valueClassName = isStandalone ? "text-sm font-semibold text-emerald-950/90 dark:text-emerald-100" : "text-[11px] font-semibold";

  return (
    <>
      <div className={`grid grid-cols-3 ${isStandalone ? "gap-2" : "gap-1"}`}>
        <StatBox
          icon={<Dumbbell className="h-3 w-3" />}
          label={t("exercises")}
          value={stats.exerciseCount}
          boxClassName={boxClassName}
          labelClassName={labelClassName}
          valueClassName={valueClassName}
        />
        <StatBox
          icon={<ListChecks className="h-3 w-3" />}
          label={t("sets")}
          value={stats.setCount}
          boxClassName={boxClassName}
          labelClassName={labelClassName}
          valueClassName={valueClassName}
        />
        <StatBox
          icon={<Repeat className="h-3 w-3" />}
          label={t("repsTotal")}
          value={stats.repsTotal}
          boxClassName={boxClassName}
          labelClassName={labelClassName}
          valueClassName={valueClassName}
        />
        <StatBox
          icon={<Weight className="h-3 w-3" />}
          label={t("totalWeight")}
          value={`${formatNumber(stats.totalWeight, 0)} ${weightUnit}`}
          boxClassName={boxClassName}
          labelClassName={labelClassName}
          valueClassName={valueClassName}
        />
        <StatBox
          icon={<Flame className="h-3 w-3" />}
          label={t("calories")}
          value={`~${formatNumber(stats.calories, 0)} kcal`}
          boxClassName={boxClassName}
          labelClassName={labelClassName}
          valueClassName={valueClassName}
          hint={
            stats.usesDefaultBodyWeightForCalories ? (
                <InfoHint
                  ariaLabel={t("calories")}
                  text={t("caloriesEstimateAverageHint")}
                  iconClassName={isStandalone ? "text-emerald-600 dark:text-emerald-300" : "text-white/75"}
                />
              ) : undefined
          }
        />
        <StatBox
          icon={<Clock3 className="h-3 w-3" />}
          label={t("duration")}
          value={<span className="tabular-nums">{durationLabel}</span>}
          boxClassName={boxClassName}
          labelClassName={labelClassName}
          valueClassName={valueClassName}
        />
      </div>
      {showCompleteAction && onComplete && (
        <div className="mt-2 flex items-end">
          <Button
            type="button"
            className="w-full rounded-full border text-white hover:opacity-95"
            style={{
              backgroundColor: "color-mix(in srgb, var(--gt-session-complete-box) 88%, black)",
              borderColor: "color-mix(in srgb, var(--gt-session-complete-box) 70%, white)"
            }}
            onClick={onComplete}
          >
            <Flag className="mr-2 h-4 w-4" />
            {t("completeSession")}
          </Button>
        </div>
      )}
    </>
  );
}
