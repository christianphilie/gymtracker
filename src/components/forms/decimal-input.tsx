import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface DecimalInputProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

function toInputString(value: number, step: number) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const decimals = step < 1 ? Math.max(0, `${step}`.split(".")[1]?.length ?? 1) : 0;
  return decimals === 0 ? `${Math.round(value)}` : value.toFixed(decimals).replace(/\.?0+$/, "");
}

function parseDecimal(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) {
    return undefined;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

export function DecimalInput({
  value,
  onCommit,
  min = 0,
  step = 1,
  disabled = false,
  className,
  ariaLabel
}: DecimalInputProps) {
  const baseString = useMemo(() => toInputString(value, step), [value, step]);
  const [draft, setDraft] = useState(baseString);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(baseString);
  }, [baseString]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      aria-label={ariaLabel}
      value={draft}
      disabled={disabled}
      className={`text-base ${className ?? ""}`}
      ref={inputRef}
      onFocus={(event) => {
        const target = event.currentTarget;
        window.setTimeout(() => {
          target.select();
        }, 0);
      }}
      onClick={() => {
        const target = inputRef.current;
        if (!target) {
          return;
        }
        window.setTimeout(() => target.select(), 0);
      }}
      onMouseUp={(event) => {
        event.preventDefault();
        const target = event.currentTarget;
        window.setTimeout(() => target.select(), 0);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        if (/^[0-9]*([.,][0-9]*)?$/.test(next) || next === "") {
          setDraft(next);
        }
      }}
      onBlur={(event) => {
        const parsed = parseDecimal(event.currentTarget.value);
        if (parsed === undefined) {
          setDraft(baseString);
          return;
        }

        const nextValue = Math.max(min, parsed);
        const rounded =
          step < 1
            ? Math.round(nextValue / step) * step
            : Math.round(nextValue / Math.max(step, 1)) * Math.max(step, 1);

        onCommit(rounded);
        setDraft(toInputString(rounded, step));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
