import { redirect } from "next/navigation";
import { NavRail } from "@/components/shell/NavRail";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * SCREEN_SPEC §0 — the shell every authenticated route shares: persistent left rail,
 * content capped at max-w-app (1120px). `proxy.ts` already redirects an unauthenticated
 * visitor before this renders; the check here only supplies the rail's identity display,
 * not a second protection layer.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1">
      <NavRail userEmail={user.email ?? ""} />
      <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
