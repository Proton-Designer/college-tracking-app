"use client";

import { getSession, updatePassword } from "@collegeos/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 10;

type LinkState = "checking" | "valid" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>("checking");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // The reset link's Supabase client (via @supabase/ssr, detectSessionInUrl: true) exchanges
    // the URL's recovery code for a session automatically on load — we just need to check whether
    // that landed a real session before letting the user set a new password.
    getSession(getBrowserSupabaseClient()).then((result) => {
      setLinkState(result.ok && result.data ? "valid" : "invalid");
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nextFieldErrors: typeof fieldErrors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      nextFieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== password) {
      nextFieldErrors.confirm = "Passwords don't match.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setSubmitting(true);
    const result = await updatePassword(getBrowserSupabaseClient(), password);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    setSubmitted(true);
    setTimeout(() => router.push("/today"), 1500);
  }

  if (linkState === "checking") {
    return <AuthShell title="Reset your password">{null}</AuthShell>;
  }

  if (linkState === "invalid") {
    return (
      <AuthShell
        title="Link expired"
        footer={
          <Link href="/forgot-password" className="text-accent underline underline-offset-2">
            Request a new link
          </Link>
        }
      >
        <FieldError>This reset link is invalid or has expired.</FieldError>
      </AuthShell>
    );
  }

  if (submitted) {
    return (
      <AuthShell title="Password updated">
        <p data-testid="reset-password-success" className="text-body text-ink-muted">
          Taking you to CollegeOS.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          data-testid="reset-password-input"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
        />
        <Input
          data-testid="reset-password-confirm-input"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirm}
          disabled={submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button data-testid="reset-password-submit" type="submit" loading={submitting} className="mt-2">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
