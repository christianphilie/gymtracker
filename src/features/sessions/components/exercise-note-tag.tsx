import { NotebookPen } from "lucide-react";

interface ExerciseNoteTagProps {
  note: string;
  className?: string;
}

function cx(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function ExerciseNoteTag({ note, className }: ExerciseNoteTagProps) {
  return (
    <span
      className={cx(
        "relative inline-flex max-w-full items-start gap-1.5 overflow-hidden rounded-[11px] border border-zinc-300/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,244,245,0.98))] px-2.5 py-1.5 text-[11px] leading-tight text-zinc-600",
        "before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-[repeating-linear-gradient(to_right,rgba(212,212,216,0.9)_0_10px,transparent_10px_15px)]",
        className
      )}
      aria-label={note}
    >
      <NotebookPen className="mt-[1px] h-3 w-3 shrink-0 text-zinc-400" aria-hidden="true" />
      <span className="min-w-0">{note}</span>
    </span>
  );
}
