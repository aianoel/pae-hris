import { WelcomePanel } from "@/components/auth/WelcomePanel";
import { SignUpForm } from "@/components/auth/SignUpForm";

/** Mirrors LoginPage's split layout so moving between the two doesn't reflow. */
export function SignUpPage() {
  return (
    <main className="grid min-h-full animate-fade-in lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <WelcomePanel />

      <div className="relative flex min-h-full items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_-10%,hsl(var(--accent))_0%,transparent_60%)] lg:hidden"
          aria-hidden="true"
        />
        <div className="relative w-full max-w-md sm:rounded-3xl sm:border sm:border-border/70 sm:bg-card sm:p-10 sm:shadow-card sm:backdrop-blur">
          <SignUpForm />
        </div>

        <footer className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-6">
          <p className="text-xs text-muted-foreground">
            © 2026 Aurora Labs, Inc. ·{" "}
            <a href="#" className="pointer-events-auto hover:text-foreground">
              Privacy
            </a>{" "}
            ·{" "}
            <a href="#" className="pointer-events-auto hover:text-foreground">
              Terms
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
