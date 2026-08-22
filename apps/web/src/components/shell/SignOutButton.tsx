"use client";

import { signOut } from "@collegeos/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSignOut() {
    setSubmitting(true);
    await signOut(getBrowserSupabaseClient());
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      data-testid="sign-out"
      variant="ghost"
      loading={submitting}
      onClick={handleSignOut}
      aria-label="Sign out"
      className={compact ? "px-2 text-caption" : undefined}
    >
      {compact ? "Out" : "Sign out"}
    </Button>
  );
}
