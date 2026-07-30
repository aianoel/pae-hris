import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { InputStatus } from "@/components/ui/input";

interface FloatingFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  leadingIcon: React.ReactNode;
  trailing?: React.ReactNode;
  error?: string | null;
  touched?: boolean;
  /** Show a green success state when valid and touched. */
  showSuccess?: boolean;
}

const statusRing: Record<InputStatus, string> = {
  default: "border-input focus-within:border-primary focus-within:shadow-focus",
  error:
    "border-destructive/70 focus-within:border-destructive focus-within:shadow-[0_0_0_4px_hsl(var(--destructive)/0.14)]",
  success:
    "border-success/55 focus-within:border-success focus-within:shadow-[0_0_0_4px_hsl(var(--success)/0.14)]",
};

/**
 * Text field with an animated floating label, an icon inside the input,
 * an optional trailing control, and inline validation messaging.
 */
export const FloatingField = React.forwardRef<HTMLInputElement, FloatingFieldProps>(
  (
    { id, label, leadingIcon, trailing, error, touched, showSuccess, className, value, onBlur, onFocus, ...props },
    ref,
  ) => {
    const [focused, setFocused] = React.useState(false);
    const hasError = Boolean(touched && error);
    const isSuccess = Boolean(showSuccess && touched && !error);
    const status: InputStatus = hasError ? "error" : isSuccess ? "success" : "default";

    const hasValue = value !== undefined && value !== null && String(value).length > 0;
    const floated = focused || hasValue;

    const describedBy = hasError ? `${id}-error` : undefined;

    return (
      <div className={cn("w-full", className)}>
        <div
          className={cn(
            "group relative flex h-14 w-full items-center gap-3 rounded-2xl border bg-card px-3.5 shadow-soft transition-all duration-200",
            statusRing[status],
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center transition-colors duration-200",
              hasError
                ? "text-destructive/80"
                : isSuccess
                  ? "text-success"
                  : focused
                    ? "text-primary"
                    : "text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {leadingIcon}
          </span>

          <div className="relative flex-1">
            {/* Floating label */}
            <label
              htmlFor={id}
              className={cn(
                "pointer-events-none absolute left-0 origin-left select-none text-muted-foreground transition-all duration-200",
                floated
                  ? "top-1.5 text-xs font-medium"
                  : "top-1/2 -translate-y-1/2 text-[0.95rem]",
                focused && !hasError && "text-primary",
                hasError && "text-destructive",
              )}
            >
              {label}
            </label>
            <input
              id={id}
              ref={ref}
              value={value}
              aria-invalid={hasError || undefined}
              aria-describedby={describedBy}
              onFocus={(e) => {
                setFocused(true);
                onFocus?.(e);
              }}
              onBlur={(e) => {
                setFocused(false);
                onBlur?.(e);
              }}
              className={cn(
                "peer h-14 w-full border-0 bg-transparent p-0 pt-[1.35rem] text-[0.95rem] leading-none text-foreground outline-none",
                "placeholder:text-transparent",
              )}
              {...props}
            />
          </div>

          {(trailing || hasError || isSuccess) && (
            <span className="flex shrink-0 items-center gap-1.5">
              {isSuccess && !trailing && (
                <CheckCircle2 className="h-[18px] w-[18px] text-success" aria-hidden="true" />
              )}
              {trailing}
            </span>
          )}
        </div>

        <AnimatePresence initial={false}>
          {hasError && (
            <motion.p
              id={`${id}-error`}
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5 overflow-hidden pl-1 pt-1.5 text-xs font-medium text-destructive"
              role="alert"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  },
);
FloatingField.displayName = "FloatingField";
