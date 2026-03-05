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
  getCanonicalMuscleMiddleGroup,
  getCanonicalMuscleMiddleLabel,
  isCanonicalMuscleKey
} from "@/lib/muscle-taxonomy";

interface ExerciseInfoDialogButtonProps {
  exerciseName: string;
  aiInfo?: ExerciseAiInfo;
  className?: string;
}

function exerciseSearchUrl(name: string, locale: "de" | "en") {
  const suffix = locale === "de" ? "Anleitung" : "Instructions";
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} ${suffix}`)}`;
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
  const groupedMuscles = useMemo(() => {
    const groups = new Map<string, { label: string; detailLabels: string[]; total: number }>();

    for (const muscle of sortedMuscles) {
      const middleLabel = getDisplayMuscleLabel(muscle.muscle, muscle.muscleKey, language);
      const detailLabel = getDisplayMuscleDetailLabel(muscle.muscle, muscle.muscleKey, language);
      const groupKey = isCanonicalMuscleKey(muscle.muscleKey)
        ? getCanonicalMuscleMiddleGroup(muscle.muscleKey)
        : middleLabel.toLowerCase();
      const current = groups.get(groupKey) ?? { label: middleLabel, detailLabels: [], total: 0 };

      current.total += muscle.involvementPercent;
      if (detailLabel && detailLabel !== middleLabel && !current.detailLabels.includes(detailLabel)) {
        current.detailLabels.push(detailLabel);
      }

      groups.set(groupKey, current);
    }

    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [language, sortedMuscles]);

  if (!aiInfo || groupedMuscles.length === 0) {
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
        <Info className="h-[1em] w-[1em]" />
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
              {exerciseName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("targetMuscles")}</h3>
              <div className="space-y-2">
                {groupedMuscles.map((muscle, index) => (
                  <div
                    key={`${muscle.label}-${muscle.total}-${index}`}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-xs font-medium text-foreground">
                        <span>{muscle.label}</span>
                      </p>
                      <p className="text-xs font-medium tabular-nums text-muted-foreground">
                        {muscle.total}%
                      </p>
                    </div>
                    {muscle.detailLabels.length > 0 && (
                      <p className="text-[10px] leading-tight text-muted-foreground/70">
                        {muscle.detailLabels.join(", ")}
                      </p>
                    )}
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, muscle.total))}%` }}
                      />
                    </div>
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
                {t("exerciseInfoAiDisclaimerWithMatch").replace("{name}", matchedDisplayName)}
              </p>
              <Button asChild variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs">
                <a href={exerciseSearchUrl(exerciseName, language)} target="_blank" rel="noreferrer">
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
