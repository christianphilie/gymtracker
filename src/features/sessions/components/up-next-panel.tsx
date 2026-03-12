import type { RefCallback } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDurationClock } from "@/lib/utils";
import type { SessionExerciseSet } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import type { CompletionStatsData } from "./completion-stats";
import { CompletionStats } from "./completion-stats";
import { SetCardContent } from "./set-card-content";
import type { SessionExercise } from "./exercise-card";

const UP_NEXT_BOX_CLASS = "relative overflow-hidden rounded-[26px] border";
const UP_NEXT_CARD_OVERLAP_PX = 45;

export type UpNextMode = "complete" | "next";

export interface RestTimerPanelState {
  elapsedSeconds: number;
  progressPercent: number;
  paused: boolean;
  hasStarted: boolean;
  isExpired: boolean;
}

function PlaySolidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 6v12l10-6z" fill="currentColor" />
    </svg>
  );
}

function PauseSolidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="7" y="6" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="13" y="6" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

interface UpNextPanelProps {
  panelRef?: RefCallback<HTMLElement>;
  mode: UpNextMode;
  nextActionableSet: SessionExerciseSet | null;
  nextActionableExercise: SessionExercise | null;
  restTimerPanelState: RestTimerPanelState | null;
  showRestTimer: boolean;
  restTimerSeconds: number;
  completionStats: CompletionStatsData | null;
  weightUnit: string;
  weightUnitLabel: string;
  language: "de" | "en";
  t: (key: TranslationKey) => string;
  onCompleteUpNextSet: () => void;
  onToggleRestTimer: () => void;
  onOpenCompleteDialog: () => void;
}

function formatFinishedDurationLabel(durationMinutes: number, language: "de" | "en") {
  const rounded = Math.max(0, Math.round(durationMinutes));
  if (rounded < 60) {
    return language === "de" ? `${rounded} Minuten` : `${rounded} min`;
  }
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return language === "de"
    ? `${hours}:${String(minutes).padStart(2, "0")} h`
    : `${hours}:${String(minutes).padStart(2, "0")} h`;
}

export function UpNextPanel({
  panelRef,
  mode,
  nextActionableSet,
  nextActionableExercise,
  restTimerPanelState,
  showRestTimer,
  restTimerSeconds,
  completionStats,
  weightUnit,
  weightUnitLabel,
  language,
  t,
  onCompleteUpNextSet,
  onToggleRestTimer,
  onOpenCompleteDialog
}: UpNextPanelProps) {
  const timerIsPrimary = !!restTimerPanelState && restTimerPanelState.hasStarted && !restTimerPanelState.isExpired;
  const nextSetIsPrimary = !timerIsPrimary;
  const timerLabel =
    !restTimerPanelState ? t("noTimer")
    : `${formatDurationClock(restTimerPanelState.elapsedSeconds)} / ${formatDurationClock(restTimerSeconds)}`;

  return (
    <section ref={panelRef} className="sticky top-2 z-10 isolate">
      {mode === "complete" && completionStats ? (
        <div
          className={`z-20 ${UP_NEXT_BOX_CLASS} border-white/15 text-white`}
          style={{ backgroundColor: "var(--gt-session-complete-box)" }}
        >
          <div className="relative z-[1] flex flex-col px-4 py-4">
            <CompletionStats
              stats={completionStats}
              weightUnit={weightUnit}
              durationLabel={formatFinishedDurationLabel(completionStats.durationMinutes, language)}
              t={t}
              onComplete={onOpenCompleteDialog}
            />
          </div>
        </div>
      ) : (
        <>
          <div
            className={`z-20 ${UP_NEXT_BOX_CLASS} backdrop-blur-xl ${
              nextSetIsPrimary
                ? "border-emerald-400/40 bg-emerald-500/90 text-emerald-50 supports-[backdrop-filter]:bg-emerald-500/80"
                : showRestTimer
                  ? "border-border bg-secondary text-foreground"
                  : "border-border bg-secondary/90 text-foreground supports-[backdrop-filter]:bg-secondary/75"
            }`}
          >
            <div className="relative z-[1] flex flex-col px-4 py-2">
              <p className={`mb-0.5 text-[11px] font-medium uppercase tracking-wide ${
                nextSetIsPrimary ? "text-emerald-50/80" : "text-foreground/45"
              }`}>
                {t("nextSet")}
              </p>
              <Button
                type="button"
                size="icon"
                disabled={!nextActionableSet?.id}
                aria-label={t("done")}
                className={`absolute right-4 top-1/2 z-[2] h-10 w-10 -translate-y-1/2 shrink-0 rounded-full ${
                  nextSetIsPrimary
                    ? "border border-white/20 bg-white/15 text-white hover:bg-white/25"
                    : "border border-input bg-background text-foreground hover:bg-secondary"
                }`}
                onClick={onCompleteUpNextSet}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
              <div className="overflow-hidden pr-14">
                {nextActionableExercise && nextActionableSet && (
                  <SetCardContent
                    exercise={nextActionableExercise}
                    set={nextActionableSet}
                    hideButton
                    noteStyle="inline"
                    variant={nextSetIsPrimary ? "colored" : "neutral-muted"}
                    weightUnitLabel={weightUnitLabel}
                    doneAriaLabel={t("done")}
                  />
                )}
              </div>
            </div>
          </div>

          {showRestTimer && (
            <div
              className={`relative z-10 -mt-[48px] ${UP_NEXT_BOX_CLASS} px-4 pb-3 backdrop-blur-xl ${
                timerIsPrimary
                  ? "border-orange-200/80 bg-orange-100/90 text-orange-950 supports-[backdrop-filter]:bg-orange-100/80 dark:border-amber-600/30 dark:bg-amber-900/40 dark:text-amber-100 dark:supports-[backdrop-filter]:bg-amber-900/30"
                  : "border-border bg-secondary/90 text-foreground supports-[backdrop-filter]:bg-secondary/70"
              }`}
              style={{ paddingTop: `${UP_NEXT_CARD_OVERLAP_PX + 6}px` }}
            >
              {timerIsPrimary && restTimerPanelState && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-orange-200/70 to-orange-400/75 transition-[width] ease-linear dark:from-amber-700/35 dark:to-amber-500/40"
                  style={{
                    width: `${Math.max(0, Math.min(100, restTimerPanelState.progressPercent))}%`,
                    transitionDuration: restTimerPanelState.paused ? "150ms" : "500ms"
                  }}
                  aria-hidden="true"
                />
              )}

              <div className="relative z-[1]">
                <p className={`mb-0.5 text-[11px] font-medium uppercase tracking-wide ${
                  timerIsPrimary ? "text-orange-900/75 dark:text-amber-100/85" : "text-foreground/45"
                }`}>
                  {t("rest")}
                </p>
                {restTimerPanelState?.hasStarted && !restTimerPanelState.isExpired && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className={`absolute right-0 z-[2] h-10 w-10 -translate-y-1/2 shrink-0 ${
                      timerIsPrimary
                        ? "border-orange-800/15 bg-white/45 text-orange-950 hover:bg-white/60 dark:border-amber-200/15 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/55"
                        : "border-input bg-background text-foreground hover:bg-secondary"
                    }`}
                    style={{ top: "50%" }}
                    aria-label={restTimerPanelState.paused ? t("resumeSession") : t("pauseTimer")}
                    onClick={onToggleRestTimer}
                  >
                    {restTimerPanelState.paused ? <PlaySolidIcon className="h-4 w-4" /> : <PauseSolidIcon className="h-4 w-4" />}
                  </Button>
                )}
                <div className="flex min-h-[20px] items-center pr-12">
                  <p className={`inline-flex items-center gap-1 text-[15px] font-semibold leading-tight tabular-nums ${
                    timerIsPrimary ? "text-orange-900/75 dark:text-amber-100/85" : "text-foreground/70"
                  }`}>
                    <Clock3 className="h-3.5 w-3.5" />
                    {timerLabel}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
