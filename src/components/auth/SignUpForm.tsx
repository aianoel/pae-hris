import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/store/auth-context";
import { Logo } from "@/components/brand/Logo";
import { FloatingField } from "@/components/auth/FloatingField";
import { validateEmail, validatePassword } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface FieldState {
  value: string;
  touched: boolean;
}

/**
 * Self-registration for employees.
 *
 * This creates a *sign-in credential for someone already on the HR roster* — it
 * does not create an employee. HR owns who works here; this form only lets a
 * known employee pick a password. An address that isn't on the roster is
 * refused (see lib/oauthAccess.ts), so the copy sets that expectation up front
 * rather than after a failed submit.
 */
export function SignUpForm() {
  const { toast } = useToast();
  const { signUpEmployee } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState<FieldState>({ value: "", touched: false });
  const [password, setPassword] = React.useState<FieldState>({ value: "", touched: false });
  const [confirm, setConfirm] = React.useState<FieldState>({ value: "", touched: false });
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [shake, setShake] = React.useState(false);
  // Set when the account was created but needs an emailed confirmation link.
  // The form is replaced by an instruction panel — there is nothing left to do
  // here, and leaving the fields would invite a confused second submit.
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  // Server-side refusal (not on the roster, inactive, already registered).
  const [rejection, setRejection] = React.useState<string | null>(null);

  const emailError = validateEmail(email.value);
  const passwordError = validatePassword(password.value);
  const confirmError = confirm.value !== password.value ? "Passwords don't match." : null;
  const formValid = !emailError && !passwordError && !confirmError;

  const triggerShake = React.useCallback(() => {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmail((s) => ({ ...s, touched: true }));
    setPassword((s) => ({ ...s, touched: true }));
    setConfirm((s) => ({ ...s, touched: true }));

    if (!formValid) {
      triggerShake();
      return;
    }

    setRejection(null);
    setLoading(true);
    const res = await signUpEmployee(email.value, password.value);
    setLoading(false);

    if (!res.ok) {
      setRejection(res.error ?? "Couldn't create your account. Please try again.");
      triggerShake();
      toast({
        variant: "error",
        title: "Couldn't create your account",
        description: res.error ?? "Please try again in a moment.",
      });
      return;
    }

    if (res.needsConfirmation) {
      setSentTo(email.value.trim());
      return;
    }

    // Signed in already — the roster check passed inside signUpEmployee, so the
    // session is live and clamped to self-service. Land on My Workspace.
    toast({
      variant: "success",
      title: "Account created",
      description: "Welcome aboard — taking you to your workspace.",
    });
    navigate("/my", { replace: true });
  };

  if (sentTo) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[26rem]"
      >
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo />
        </div>

        <div className="flex flex-col items-center text-center">
          <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
            Confirm your email
          </h2>
          <p className="mt-3 text-[0.95rem] text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{sentTo}</span>. Open it to
            finish setting up your account.
          </p>
          {/* Say this now, not after they click through: confirming proves the
              mailbox, it doesn't decide admission. The roster check runs when
              the link lands and can still refuse a non-employee. */}
          <p className="mt-3 text-sm text-muted-foreground">
            Your work email must be on the HR roster to sign in. If it isn&apos;t,
            contact HR and they&apos;ll get you set up.
          </p>
          <Button asChild variant="outline" className="mt-7 w-full" size="lg">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={cn("w-full max-w-[26rem]", shake && "animate-shake")}
      onAnimationEnd={() => setShake(false)}
    >
      <div className="mb-8 flex justify-center lg:hidden">
        <Logo />
      </div>

      <div className="mb-8">
        <h2 className="text-[2rem] font-semibold leading-tight tracking-tight text-foreground">
          Create your account
        </h2>
        <p className="mt-2 text-[0.95rem] text-muted-foreground">
          For staff on the PAE HRIS roster — set a password for your work email.
        </p>
      </div>

      {/* Sets the rule before the attempt. Being refused after choosing a
          password is a poor way to learn that registration is roster-gated. */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4">
        <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Use the work email HR holds for you. Accounts open your own payslips,
          leave and attendance — admin access is granted separately.
        </p>
      </div>

      {rejection && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-muted-foreground">{rejection}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FloatingField
          id="signup-email"
          label="Work email"
          type="email"
          autoComplete="email"
          leadingIcon={<Mail className="h-[18px] w-[18px]" />}
          value={email.value}
          error={emailError}
          touched={email.touched}
          showSuccess
          onChange={(e) => setEmail({ value: e.target.value, touched: email.touched })}
          onBlur={() => setEmail((s) => ({ ...s, touched: true }))}
        />

        <FloatingField
          id="signup-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          leadingIcon={<Lock className="h-[18px] w-[18px]" />}
          value={password.value}
          error={passwordError}
          touched={password.touched}
          showSuccess
          onChange={(e) => setPassword({ value: e.target.value, touched: password.touched })}
          onBlur={() => setPassword((s) => ({ ...s, touched: true }))}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          }
        />

        <FloatingField
          id="signup-confirm"
          label="Confirm password"
          // Deliberately follows the show/hide toggle above: masking one field
          // while revealing the other makes a mismatch impossible to spot.
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          leadingIcon={<Lock className="h-[18px] w-[18px]" />}
          value={confirm.value}
          error={confirmError}
          touched={confirm.touched}
          showSuccess
          onChange={(e) => setConfirm({ value: e.target.value, touched: confirm.touched })}
          onBlur={() => setConfirm((s) => ({ ...s, touched: true }))}
        />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/login"
          className="rounded font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </p>

      <p className="mt-4 flex items-center justify-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </p>
    </motion.div>
  );
}
