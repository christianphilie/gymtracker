import * as React from "react";
import { cn } from "@/lib/utils";

function isTextSelectableInput(input: HTMLInputElement) {
  const type = (input.type || "text").toLowerCase();
  return ["", "text", "search", "tel", "url", "email", "password", "number"].includes(type);
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onClick, onMouseUp, ...props }, ref) => {
    const selectAll = (target: HTMLInputElement) => {
      if (target.disabled || target.readOnly || !isTextSelectableInput(target)) {
        return;
      }
      window.setTimeout(() => {
        try {
          target.select();
        } catch {
          // Ignore unsupported input types/platform quirks.
        }
      }, 0);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        onFocus={(event) => {
          onFocus?.(event);
          selectAll(event.currentTarget);
        }}
        onClick={(event) => {
          onClick?.(event);
          selectAll(event.currentTarget);
        }}
        onMouseUp={(event) => {
          onMouseUp?.(event);
          if (event.defaultPrevented) {
            return;
          }
          event.preventDefault();
          selectAll(event.currentTarget);
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
