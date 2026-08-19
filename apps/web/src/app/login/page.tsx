"use client";

import { signIn } from "@collegeos/api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/today";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nextFieldErrors: typeof fieldErrors = {};
    if (!email.trim()) nextFieldErrors.email = "Enter your email address.";
    if (!password) nextFieldErrors.password = "Enter your password.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFormError("You're offline. Check your connection and try again.");
      return;
    }

    setSubmitting(true);
    const result = await signIn(getBrowserSupabaseClient(), { email, password });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          <Link href="/forgot-password" data-testid="forgot-password-link" className="text-accent underline underline-offset-2">
            Forgot your password?
          </Link>
          <p className="mt-3">
            No account?{" "}
            <Link href="/signup" data-testid="signup-link" className="text-accent underline underline-offset-2">
              Create one
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          data-testid="email-input"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={submitting}
        />
        <Input
          data-testid="password-input"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button data-testid="login-submit" type="submit" loading={submitting} className="mt-2">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
