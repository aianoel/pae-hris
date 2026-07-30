import { cn } from "@/lib/utils";

/** Small keyboard-key badge, e.g. ⌘ K. */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center gap-0.5 rounded-md border border-border bg-muted px-1.5 font-sans text-[0.7rem] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
