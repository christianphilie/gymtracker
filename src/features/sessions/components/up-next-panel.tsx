import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDurationClock } from "@/lib/utils";
import type { SessionExerciseSet } from "@/db/types";
import type { TranslationKey } from "@/i18n/translations";
import type { CompletionStatsData } from "./completion-stats";
import { CompletionStats } from "./completion-stats";
import { SetCardContent } from "./set-card-content";
import type { SessionExercise } from "./exercise-card";

const UP_NEXT_BOX_CLASS = "relative overflow-hidden rounded-[30px] border";
const UP_NEXT_CARD_OVERLAP_PX = 45;

export type UpNextMode = "complete" | "rest" | "next";

export interface RestTimerPanelState {
  elapsedSeconds: number;
  progressPercent: number;
  paused: boolean;
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
  mode: UpNextMode;
  nextActionableSet: SessionExerciseSet | null;
  nextActionableExercise: SessionExercise | null;
  followingActionableSet: SessionExerciseSet | null;
  followingActionableExercise: SessionExercise | null;
  restTimerPanelState: RestTimerPanelState | null;
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
    ? `${hours}:${String(minutes).padStart(2, "0")} Stunden`
    : `${hours}:${String(minutes).padStart(2, "0")} h`;
}

export function UpNextPanel({
  mode,
  nextActionableSet,
  nextActionableExercise,
  followingActionableSet,
  followingActionableExercise,
  restTimerPanelState,
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
  const topCardTitle = mode === "next" ? t("nextSet") : mode === "rest" ? t("rest") : null;
  const showAfterTitle = mode === "next" || mode === "rest";
  const afterCardClassName =
    mode === "complete"
      ? "text-blue-950 dark:text-blue-100"
      : "border-border bg-secondary/90 text-foreground backdrop-blur supports-[backdrop-filter]:bg-secondary/70";
  const upNextBottomCardPaddingTop = 6 + UP_NEXT_CARD_OVERLAP_PX;

  return (
    <section className="sticky top-2 z-10 isolate">
      {/* Top card */}
      <div
        className={`z-20 ${UP_NEXT_BOX_CLASS} ${
          mode === "next"
            ? "border-emerald-400/40 bg-emerald-500 text-emerald-50"
            : mode === "complete"
              ? "border-white/15 text-white"
              : "border-orange-200/80 bg-orange-100 text-orange-950 dark:border-orange-900/40 dark:bg-orange-950 dark:text-orange-100"
        }`}
        style={mode === "complete" ? { backgroundColor: "var(--gt-session-complete-box)" } : undefined}
      >
        {mode === "rest" && restTimerPanelState && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-orange-200/70 to-orange-400/75 transition-[width] ease-linear dark:from-orange-700/35 dark:to-orange-500/40"
            style={{
              width: `${restTimerPanelState.progressPercent}%`,
              transitionDuration: restTimerPanelState.paused ? "150ms" : "500ms"
            }}
            aria-hidden="true"
          />
        )}

        <div className={`relative z-[1] flex flex-col px-4 ${mode === "complete" ? "py-4" : "py-2"}`}>
          {topCardTitle && (
            <p className={`mb-0.5 text-[11px] font-medium uppercase tracking-wide ${
              mode === "complete"
                ? "text-white/80"
                : mode === "next"
                  ? "text-emerald-50/80"
                  : "text-orange-900/75 dark:text-orange-100/80"
            }`}>
              {topCardTitle}
            </p>
          )}

          {mode === "complete" && completionStats ? (
            <CompletionStats
              stats={completionStats}
              weightUnit={weightUnit}
              durationLabel={formatFinishedDurationLabel(completionStats.durationMinutes, language)}
              t={t}
              onComplete={onOpenCompleteDialog}
            />
          ) : mode === "rest" && restTimerPanelState ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-4 top-1/2 z-[2] h-10 w-10 -translate-y-1/2 shrink-0 border-orange-800/15 bg-white/45 text-orange-950 hover:bg-white/60 dark:border-orange-100/10 dark:bg-black/20 dark:text-orange-100 dark:hover:bg-black/30"
                aria-label={restTimerPanelState.paused ? t("resumeSession") : t("pauseTimer")}
                onClick={onToggleRestTimer}
              >
                {restTimerPanelState.paused ? <PlaySolidIcon className="h-4 w-4" /> : <PauseSolidIcon className="h-4 w-4" />}
              </Button>
              <div className="flex flex-1 items-center pr-12" style={{ minHeight: "20px" }}>
                <p className="text-[15px] font-semibold leading-tight tabular-nums text-orange-900/75 dark:text-orange-100/80">
                  {formatDurationClock(restTimerPanelState.elapsedSeconds)} / {formatDurationClock(restTimerSeconds)}
                </p>
              </div>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="icon"
                disabled={!nextActionableSet?.id}
                aria-label={t("done")}
                className="absolute right-4 top-1/2 z-[2] h-10 w-10 -translate-y-1/2 shrink-0 rounded-full border border-white/20 bg-white/15 text-white hover:bg-white/25"
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
                    weightUnitLabel={weightUnitLabel}
                    doneAriaLabel={t("done")}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom card (after-card) */}
      {mode !== "complete" && (
        <div
          className={`relative z-10 -mt-[48px] ${UP_NEXT_BOX_CLASS} px-4 pb-3 ${afterCardClassName}`}
          style={{ paddingTop: `${upNextBottomCardPaddingTop}px` }}
        >
          {showAfterTitle && (
            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/35">
              {t("afterward")}
            </p>
          )}

          {mode === "next" && (
            <div className="overflow-hidden">
              {followingActionableExercise && followingActionableSet ? (
                <SetCardContent
                  exercise={followingActionableExercise}
                  set={followingActionableSet}
                  compact
                  previewOnly
                  variant="neutral-muted"
                  weightUnitLabel={weightUnitLabel}
                  doneAriaLabel={t("done")}
                />
              ) : (
                <div className="flex items-center gap-1 text-sm font-semibold text-foreground/45">
                  <Flag className="h-3 w-3 shrink-0" />
                  <span className="leading-tight">{t("completeSession")}</span>
                </div>
              )}
            </div>
          )}

          {mode === "rest" && nextActionableExercise && nextActionableSet && (
            <>
              <Button
                type="button"
                size="icon"
                disabled={!nextActionableSet.id}
                aria-label={t("done")}
                className="absolute right-4 z-[2] h-9 w-9 shrink-0 rounded-full border border-input bg-background text-foreground hover:bg-secondary"
                style={{ top: `calc(50% + ${UP_NEXT_CARD_OVERLAP_PX / 2}px)`, transform: "translateY(-50%)" }}
                onClick={onCompleteUpNextSet}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
              <div className="overflow-hidden pr-12">
                <SetCardContent
                  exercise={nextActionableExercise}
                  set={nextActionableSet}
                  compact
                  hideButton
                  variant="neutral-muted"
                  weightUnitLabel={weightUnitLabel}
                  doneAriaLabel={t("done")}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
