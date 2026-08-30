"use client";

import { getSession } from "@collegeos/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { FieldError } from "@/components/ui/FieldError";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

type ConfirmState = "checking" | "confirmed" | "invalid";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<ConfirmState>("checking");

  useEffect(() => {
    // Same mechanism as reset-password: the confirmation link's code is exchanged for a session
    // automatically (detectSessionInUrl: true) before this effect runs.
    getSession(getBrowserSupabaseClient()).then((result) => {
      if (result.ok && result.data) {
        setState("confirmed");
        setTimeout(() => router.push("/today"), 1200);
      } else {
        setState("invalid");
      }
    });
  }, [router]);

  if (state === "checking") {
    return <AuthShell title="Confirming your email">{null}</AuthShell>;
  }

  if (state === "invalid") {
    return (
      <AuthShell
        title="Confirmation link expired"
        footer={
          <Link href="/signup" className="text-accent underline underline-offset-2">
            Sign up again
          </Link>
        }
      >
        <FieldError>This confirmation link is invalid or has expired.</FieldError>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email confirmed">
      <p data-testid="confirm-success" className="text-body text-ink-muted">
        Taking you to Ihsan.
      </p>
    </AuthShell>
  );
}
