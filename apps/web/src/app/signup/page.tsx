"use client";

import { signUp } from "@collegeos/api";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 10;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nextFieldErrors: typeof fieldErrors = {};
    if (!email.trim()) nextFieldErrors.email = "Enter your email address.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      nextFieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFormError("You're offline. Check your connection and try again.");
      return;
    }

    setSubmitting(true);
    const result = await signUp(getBrowserSupabaseClient(), { email, password });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    // Same copy whether the address was already registered or genuinely new — the backend is
    // enumeration-safe on purpose, and the UI must not undo that by branching here.
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email">
        <p data-testid="signup-success" className="text-body text-ink-muted">
          If {email} isn&apos;t already registered, we&apos;ve sent a confirmation link to it. Follow it to
          finish setting up your account.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" data-testid="login-link" className="text-accent underline underline-offset-2">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          data-testid="signup-email-input"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={submitting}
        />
        <Input
          data-testid="signup-password-input"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button data-testid="signup-submit" type="submit" loading={submitting} className="mt-2">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
