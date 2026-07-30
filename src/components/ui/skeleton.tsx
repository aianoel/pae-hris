import { cn } from "@/lib/utils";

/** Shimmering placeholder block used for loading states. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/70",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer",
        "before:bg-gradient-to-r before:from-transparent before:via-black/[0.04] before:to-transparent dark:before:via-white/[0.06]",
        className,
      )}
      {...props}
    />
  );
}
