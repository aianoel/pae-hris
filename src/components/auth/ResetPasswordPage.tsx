/**
 * "Set a new password" screen.
 *
 * Shown when Supabase reports a PASSWORD_RECOVERY event — i.e. the user arrived
 * from an emailed reset link, which opens a short-lived recovery session. The
 * app is gated behind this screen (see App.tsx) until the new password is
 * committed, so a recovery session can never be used to browse the app.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/store/auth-context";
import { Logo } from "@/components/brand/Logo";
import { FloatingField } from "@/components/auth/FloatingField";
import { validatePassword } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface FieldState {
  value: string;
  touched: boolean;
}

export function ResetPasswordPage() {
  const { toast } = useToast();
  const { user, completePasswordReset, logout } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = React.useState<FieldState>({ value: "", touched: false });
  const [confirm, setConfirm] = React.useState<FieldState>({ value: "", touched: false });
  const [show, setShow] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [shake, setShake] = React.useState(false);

  const passwordError = validatePassword(password.value);
  const confirmError = confirm.value !== password.value ? "Passwords do not match." : null;
  const formValid = !passwordError && !confirmError;

  const triggerShake = React.useCallback(() => {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassword((s) => ({ ...s, touched: true }));
    setConfirm((s) => ({ ...s, touched: true }));

    if (!formValid) {
      triggerShake();
      return;
    }

    setLoading(true);
    const res = await completePasswordReset(password.value);
    setLoading(false);

    if (res.ok) {
      toast({
        variant: "success",
        title: "Password updated",
        description: "You're signed in with your new password.",
      });
      navigate("/", { replace: true });
    } else {
      triggerShake();
      toast({
        variant: "error",
        title: "Couldn't update password",
        description: res.error ?? "The reset link may have expired — request a new one.",
      });
    }
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
    >
      {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
    </button>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "w-full max-w-md sm:rounded-3xl sm:border sm:border-border/70 sm:bg-card sm:p-10 sm:shadow-card",
          shake && "animate-shake",
        )}
        onAnimationEnd={() => setShake(false)}
      >
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="mb-8">
          <h2 className="text-[2rem] font-semibold leading-tight tracking-tight text-foreground">
            Set a new password
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted-foreground">
            {user?.email
              ? `Choose a new password for ${user.email}.`
              : "Choose a new password for your account."}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FloatingField
            id="new-password"
            type={show ? "text" : "password"}
            name="new-password"
            label="New password"
            autoComplete="new-password"
            leadingIcon={<Lock className="h-[18px] w-[18px]" />}
            value={password.value}
            onChange={(e) => setPassword((s) => ({ ...s, value: e.target.value }))}
            onBlur={() => setPassword((s) => ({ ...s, touched: true }))}
            error={passwordError}
            touched={password.touched}
            disabled={loading}
            trailing={toggle}
          />

          <FloatingField
            id="confirm-password"
            type={show ? "text" : "password"}
            name="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            leadingIcon={<Lock className="h-[18px] w-[18px]" />}
            value={confirm.value}
            onChange={(e) => setConfirm((s) => ({ ...s, value: e.target.value }))}
            onBlur={() => setConfirm((s) => ({ ...s, touched: true }))}
            error={confirmError}
            touched={confirm.touched}
            showSuccess
            disabled={loading}
          />

          <Button type="submit" size="xl" loading={loading} className="mt-2 w-full">
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>

        <button
          type="button"
          onClick={logout}
          disabled={loading}
          className="mt-6 w-full rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Cancel and sign out
        </button>
      </motion.div>
    </main>
  );
}
