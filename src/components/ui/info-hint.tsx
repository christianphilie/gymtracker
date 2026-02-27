import { Info } from "lucide-react";

interface InfoHintProps {
  text: string;
  ariaLabel: string;
  className?: string;
  iconClassName?: string;
}

export function InfoHint({ text, ariaLabel, className, iconClassName }: InfoHintProps) {
  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        className={`peer inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${iconClassName ?? "text-muted-foreground/80"}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] leading-snug text-slate-900 opacity-0 shadow-md transition peer-hover:visible peer-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
