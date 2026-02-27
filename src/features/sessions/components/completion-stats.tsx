import type { ReactNode } from "react";
import { Clock3, Dumbbell, Flag, Flame, ListChecks, Repeat, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { formatNumber } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/translations";

function StatBox({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1">
      <p className="inline-flex items-center gap-1 text-[10px] text-white/75">{icon}{label}</p>
      <p className="text-[11px] font-semibold">{value}</p>
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
  onComplete: () => void;
}

export function CompletionStats({ stats, weightUnit, durationLabel, t, onComplete }: CompletionStatsProps) {
  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        <StatBox
          icon={<Dumbbell className="h-3 w-3" />}
          label={t("exercises")}
          value={stats.exerciseCount}
        />
        <StatBox
          icon={<ListChecks className="h-3 w-3" />}
          label={t("sets")}
          value={stats.setCount}
        />
        <StatBox
          icon={<Repeat className="h-3 w-3" />}
          label={t("repsTotal")}
          value={stats.repsTotal}
        />
        <StatBox
          icon={<Weight className="h-3 w-3" />}
          label={t("totalWeight")}
          value={`${formatNumber(stats.totalWeight, 0)} ${weightUnit}`}
        />
        <StatBox
          icon={<Flame className="h-3 w-3" />}
          label={t("calories")}
          value={`~${formatNumber(stats.calories, 0)} kcal`}
        />
        <StatBox
          icon={<Clock3 className="h-3 w-3" />}
          label={t("duration")}
          value={<span className="tabular-nums">{durationLabel}</span>}
        />
      </div>
      {stats.usesDefaultBodyWeightForCalories && (
        <div className="mt-0.5 flex justify-end">
          <InfoHint
            ariaLabel={t("calories")}
            text={t("caloriesEstimateAverageHint")}
            iconClassName="text-white/75"
          />
        </div>
      )}
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
    </>
  );
}
