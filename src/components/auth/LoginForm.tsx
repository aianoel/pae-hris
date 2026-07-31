import * as React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, ShieldAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/store/auth-context";
import { Logo } from "@/components/brand/Logo";
import { FloatingField } from "@/components/auth/FloatingField";
import { SocialButtons, type SocialProvider } from "@/components/auth/SocialButtons";
import { validateEmail, validatePassword } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface FieldState {
  value: string;
  touched: boolean;
}

export function LoginForm() {
  const { toast } = useToast();
  const { login, loginWithProvider, sendPasswordReset, deniedReason, clearDenied } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState<FieldState>({ value: "", touched: false });
  const [password, setPassword] = React.useState<FieldState>({ value: "", touched: false });
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [sendingReset, setSendingReset] = React.useState(false);
  // Which OAuth provider is mid-hand-off, if any.
  const [pending, setPending] = React.useState<SocialProvider | null>(null);
  const [shake, setShake] = React.useState(false);

  const emailError = validateEmail(email.value);
  const passwordError = validatePassword(password.value);
  const formValid = !emailError && !passwordError;

  const triggerShake = React.useCallback(() => {
    setShake(false);
    // next frame so the animation can restart
    requestAnimationFrame(() => setShake(true));
  }, []);

  // A provider sign-in that was refused server-side lands back here after the
  // redirect, so the rejection arrives on mount rather than from a click. Clear
  // the spinner and announce it once.
  React.useEffect(() => {
    if (!deniedReason) return;
    setPending(null);
    triggerShake();
    toast({
      variant: "error",
      title: "Sign-in not permitted",
      description: deniedReason,
    });
  }, [deniedReason, toast, triggerShake]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmail((s) => ({ ...s, touched: true }));
    setPassword((s) => ({ ...s, touched: true }));

    if (!formValid) {
      triggerShake();
      return;
    }

    setLoading(true);
    const ok = await login(email.value, password.value);
    setLoading(false);

    if (ok) {
      toast({
        variant: "success",
        title: "Welcome back!",
        description: "Redirecting you to your workspace…",
      });
      navigate("/", { replace: true });
    } else {
      triggerShake();
      toast({
        variant: "error",
        title: "Incorrect email or password",
        description: "Check your credentials and try again.",
      });
    }
  };

  // Self-service reset: emails a recovery link to whatever is typed in the
  // email field. The confirmation is deliberately generic — it does not reveal
  // whether the address has an account (email enumeration).
  const handleForgot = async () => {
    setEmail((s) => ({ ...s, touched: true }));
    if (emailError) {
      triggerShake();
      toast({
        variant: "error",
        title: "Enter your email first",
        description: "We'll send the reset link to that address.",
      });
      return;
    }

    setSendingReset(true);
    const res = await sendPasswordReset(email.value);
    setSendingReset(false);

    if (res.ok) {
      toast({
        variant: "success",
        title: "Check your email",
        description: `If an account exists for ${email.value.trim()}, a reset link is on its way.`,
      });
    } else {
      toast({
        variant: "error",
        title: "Couldn't send reset link",
        description: res.error ?? "Please try again in a moment.",
      });
    }
  };

  // Hand off to the provider. On success the browser navigates away, so
  // `pending` is deliberately left set — clearing it would flash the buttons
  // back to their idle state during the redirect.
  const handleProvider = async (provider: SocialProvider) => {
    setPending(provider);
    const res = await loginWithProvider(provider === "microsoft" ? "azure" : "google");

    if (!res.ok) {
      setPending(null);
      triggerShake();
      toast({
        variant: "error",
        title: `Couldn't continue with ${provider === "google" ? "Google" : "Microsoft"}`,
        description: res.error ?? "Please try again in a moment.",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={cn("w-full max-w-[26rem]", shake && "animate-shake")}
      onAnimationEnd={() => setShake(false)}
    >
      {/* Mobile logo (welcome panel is hidden on small screens) */}
      <div className="mb-8 flex justify-center lg:hidden">
        <Logo />
      </div>

      <div className="mb-8">
        <h2 className="text-[2rem] font-semibold leading-tight tracking-tight text-foreground">
          Welcome back
        </h2>
        <p className="mt-2 text-[0.95rem] text-muted-foreground">
          Sign in to your PAE HRIS workspace to continue.
        </p>
      </div>

      {/* Persistent refusal notice. The toast above announces it, but auto-
          dismisses after a few seconds — someone who was just bounced out of a
          provider redirect needs the reason to stay on screen. */}
      {deniedReason && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <ShieldAlert className="mt-0.5 h-[18px] w-[18px] shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Sign-in not permitted</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{deniedReason}</p>
          </div>
          <button
            type="button"
            onClick={clearDenied}
            className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FloatingField
          id="email"
          type="email"
          name="email"
          label="Email address"
          autoComplete="email"
          inputMode="email"
          leadingIcon={<Mail className="h-[18px] w-[18px]" />}
          value={email.value}
          onChange={(e) => setEmail((s) => ({ ...s, value: e.target.value }))}
          onBlur={() => setEmail((s) => ({ ...s, touched: true }))}
          error={emailError}
          touched={email.touched}
          showSuccess
          disabled={loading}
        />

        <FloatingField
          id="password"
          type={showPassword ? "text" : "password"}
          name="password"
          label="Password"
          autoComplete="current-password"
          leadingIcon={<Lock className="h-[18px] w-[18px]" />}
          value={password.value}
          onChange={(e) => setPassword((s) => ({ ...s, value: e.target.value }))}
          onBlur={() => setPassword((s) => ({ ...s, touched: true }))}
          error={passwordError}
          touched={password.touched}
          disabled={loading}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              tabIndex={0}
            >
              <motion.span
                key={showPassword ? "on" : "off"}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </motion.span>
            </button>
          }
        />

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(v) => setRemember(Boolean(v))}
              disabled={loading}
            />
            <Label htmlFor="remember" className="cursor-pointer text-muted-foreground">
              Remember me
            </Label>
          </div>
          <button
            type="button"
            onClick={handleForgot}
            disabled={loading || sendingReset}
            className="rounded text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {sendingReset ? "Sending…" : "Forgot password?"}
          </button>
        </div>

        <Button
          type="submit"
          size="xl"
          loading={loading}
          // Block the password path while an OAuth redirect is in flight, so
          // the two sign-in routes can't race each other.
          disabled={Boolean(pending)}
          className="mt-2 w-full"
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          employee sign-in
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SocialButtons disabled={loading} pending={pending} onProvider={handleProvider} />

      {/* Set expectations before the redirect: being refused after a round-trip
          through Google is a poor way to learn the rule. */}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        For staff with a work email on the HR roster. Opens your own payslips,
        leave and attendance.
      </p>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            toast({
              variant: "info",
              title: "Create your account",
              description: "The sign-up flow would open here.",
            });
          }}
          className="rounded font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Sign up for free
        </a>
      </p>
    </motion.div>
  );
}
