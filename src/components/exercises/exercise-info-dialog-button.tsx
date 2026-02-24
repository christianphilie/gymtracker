import { useMemo, useRef, useState } from "react";
import { BookSearch, Info, Sparkles } from "lucide-react";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { ExerciseAiInfo } from "@/db/types";
import {
  getCanonicalMuscleDetailLabel,
  getCanonicalMuscleMiddleLabel,
  isCanonicalMuscleKey
} from "@/lib/muscle-taxonomy";

interface ExerciseInfoDialogButtonProps {
  exerciseName: string;
  aiInfo?: ExerciseAiInfo;
  className?: string;
}

function exerciseSearchUrl(name: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} exercise database`)}`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatMuscleLabel(label: string) {
  return label
    .replace(/\s*muskulatur$/i, "")
    .replace(/\s*musculature$/i, "")
    .trim();
}

function getDisplayMuscleLabel(label: string, muscleKey: unknown, locale: "de" | "en") {
  if (isCanonicalMuscleKey(muscleKey)) {
    return getCanonicalMuscleMiddleLabel(muscleKey, locale);
  }
  return formatMuscleLabel(label);
}

function getDisplayMuscleDetailLabel(label: string, muscleKey: unknown, locale: "de" | "en") {
  if (isCanonicalMuscleKey(muscleKey)) {
    return getCanonicalMuscleDetailLabel(muscleKey, locale);
  }
  return null;
}

export function ExerciseInfoDialogButton({
  exerciseName,
  aiInfo,
  className
}: ExerciseInfoDialogButtonProps) {
  const { t, language } = useSettings();
  const [open, setOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  const sortedMuscles = useMemo(
    () => [...(aiInfo?.targetMuscles ?? [])].sort((a, b) => b.involvementPercent - a.involvementPercent),
    [aiInfo?.targetMuscles]
  );

  if (!aiInfo || sortedMuscles.length === 0) {
    return null;
  }

  const matchedDisplayName = aiInfo.matchedExerciseName?.trim() || exerciseName.trim() || "-";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          className
        )}
        aria-label={t("exerciseInfo")}
        title={t("exerciseInfo")}
      >
        <Info className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle ref={titleRef} tabIndex={-1} className="pr-8 text-lg leading-tight">
              {matchedDisplayName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("targetMuscles")}</h3>
              <div className="space-y-2">
                {sortedMuscles.map((muscle, index) => (
                  <div
                    key={`${String(muscle.muscleKey ?? muscle.muscle)}-${muscle.involvementPercent}-${index}`}
                    className="space-y-1"
                  >
                    {(() => {
                      const middleLabel = getDisplayMuscleLabel(muscle.muscle, muscle.muscleKey, language);
                      const detailLabel = getDisplayMuscleDetailLabel(muscle.muscle, muscle.muscleKey, language);
                      const showDetail = !!detailLabel && detailLabel !== middleLabel;

                      return (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 text-xs font-medium text-foreground">
                              <span>{middleLabel}</span>
                              {showDetail && (
                                <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">
                                  {detailLabel}
                                </span>
                              )}
                            </p>
                            <p className="text-xs font-medium tabular-nums text-muted-foreground">
                              {muscle.involvementPercent}%
                            </p>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(0, Math.min(100, muscle.involvementPercent))}%` }}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("executionGuide")}</h3>
              <p className="text-xs leading-tight text-muted-foreground">{aiInfo.executionGuide}</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("coachingTips")}</h3>
              <ul className="space-y-0 text-xs leading-tight text-muted-foreground">
                {aiInfo.coachingTips.map((tip, index) => (
                  <li key={`${index}-${tip}`} className="flex items-start gap-1.5">
                    <span className="mt-[5px] h-1 w-1 rounded-full bg-muted-foreground/70" aria-hidden="true" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60" />
                {t("exerciseInfoAiDisclaimerShort")}
              </p>
              <Button asChild variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs">
                <a href={exerciseSearchUrl(exerciseName)} target="_blank" rel="noreferrer">
                  <BookSearch className="h-3 w-3" />
                  {t("moreExerciseResearch")}
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
