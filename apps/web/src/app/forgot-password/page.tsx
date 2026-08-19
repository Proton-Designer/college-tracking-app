"use client";

import { resetPassword } from "@collegeos/api";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFieldError("Enter your email address.");
      return;
    }
    setFieldError(undefined);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFormError("You're offline. Check your connection and try again.");
      return;
    }

    setSubmitting(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const result = await resetPassword(getBrowserSupabaseClient(), email, redirectTo);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email">
        <p data-testid="forgot-password-success" className="text-body text-ink-muted">
          If {email} has an account, we&apos;ve sent a link to reset the password.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login" className="text-accent underline underline-offset-2">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          data-testid="forgot-password-email-input"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
          disabled={submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button data-testid="forgot-password-submit" type="submit" loading={submitting} className="mt-2">
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
