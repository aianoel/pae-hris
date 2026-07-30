import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Show the wordmark next to the glyph. */
  withWordmark?: boolean;
  /** Render the glyph in white (for dark backgrounds). */
  inverted?: boolean;
}

export function Logo({ className, withWordmark = true, inverted = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[10px] shadow-soft",
          inverted
            ? "bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur"
            : "bg-gradient-to-br from-[#3B82F6] to-primary",
        )}
      >
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M9 21.5L16 8l7 13.5M12 18.5h8"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {withWordmark && (
        <span
          className={cn(
            "text-lg font-semibold tracking-tight",
            inverted ? "text-white" : "text-foreground",
          )}
        >
          Aurora
        </span>
      )}
    </div>
  );
}
