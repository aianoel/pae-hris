import * as React from "react";

import { cn } from "@/lib/utils";

export type InputStatus = "default" | "error" | "success";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered on the left inside the field. */
  leadingIcon?: React.ReactNode;
  /** Interactive element rendered on the right (e.g. show/hide toggle). */
  trailing?: React.ReactNode;
  status?: InputStatus;
}

const statusRing: Record<InputStatus, string> = {
  default:
    "border-input focus-within:border-primary focus-within:shadow-focus",
  error:
    "border-destructive/70 focus-within:border-destructive focus-within:shadow-[0_0_0_4px_hsl(var(--destructive)/0.14)]",
  success:
    "border-success/60 focus-within:border-success focus-within:shadow-[0_0_0_4px_hsl(var(--success)/0.14)]",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leadingIcon, trailing, status = "default", ...props }, ref) => {
    return (
      <div
        className={cn(
          "group flex h-12 w-full items-center gap-2.5 rounded-xl border bg-card px-3.5 shadow-soft transition-all duration-200",
          statusRing[status],
          className,
        )}
      >
        {leadingIcon && (
          <span
            className={cn(
              "flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200",
              status === "default" && "group-focus-within:text-primary",
              status === "error" && "text-destructive/80",
              status === "success" && "text-success",
            )}
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            "peer h-full w-full border-0 bg-transparent p-0 text-[0.95rem] text-foreground outline-none",
            "placeholder:text-muted-foreground/70",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          {...props}
        />
        {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
