import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";

interface ExerciseNoteTagProps {
  note: string;
  className?: string;
}

const NOTE_ZIGZAG_STEP_PX = 10;
const NOTE_HORIZONTAL_PADDING_PX = 20;
const NOTE_BORDER_PX = 2;
const NOTE_ICON_AND_GAP_PX = 14;

function cx(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function ExerciseNoteTag({ note, className }: ExerciseNoteTagProps) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [snappedWidth, setSnappedWidth] = useState<number | null>(null);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const updateWidth = () => {
      const textWidth = Math.ceil(node.getBoundingClientRect().width);
      const rawWidth = textWidth + NOTE_HORIZONTAL_PADDING_PX + NOTE_BORDER_PX + NOTE_ICON_AND_GAP_PX;
      setSnappedWidth(Math.ceil(rawWidth / NOTE_ZIGZAG_STEP_PX) * NOTE_ZIGZAG_STEP_PX);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [note]);

  return (
    <span
      className={cx(
        "relative inline-flex max-w-full overflow-visible border-x border-b border-t-0 border-zinc-200/80 px-2.5 pb-1.5 pt-2.5 text-[11px] leading-tight text-zinc-500/85 dark:border-zinc-700/80",
        "rounded-b-[4px]",
        className
      )}
      style={snappedWidth ? { width: `${snappedWidth}px`, maxWidth: "100%" } : undefined}
      aria-label={note}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[-1px] right-[-1px] top-[-1px] h-[4px] dark:hidden"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='4' viewBox='0 0 10 4'%3E%3Cpath d='M0 1 L5 4 L10 1' fill='none' stroke='%23e4e4e7' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundSize: "10px 4px",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "left top"
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[-1px] right-[-1px] top-[-1px] hidden h-[4px] dark:block"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='4' viewBox='0 0 10 4'%3E%3Cpath d='M0 1 L5 4 L10 1' fill='none' stroke='%2352525b' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundSize: "10px 4px",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "left top"
        }}
      />
      <span aria-hidden="true" className="mt-[1px] mr-1 inline-flex shrink-0 text-zinc-400/80">
        <NotebookPen className="h-3 w-3" />
      </span>
      <span ref={textRef} className="min-w-0">
        {note}
      </span>
    </span>
  );
}
