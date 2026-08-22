import { redirect } from "next/navigation";
import { Island } from "@/components/shell/Island";
import { TopBar } from "@/components/shell/TopBar";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * DESIGN_LANGUAGE_V2 §5 — the shell every authenticated route shares: a slim top strip for
 * identity (TopBar), content, and the floating glass Island as primary nav. `proxy.ts` already
 * redirects an unauthenticated visitor before this renders; the check here only supplies the
 * shell's identity display, not a second protection layer.
 *
 * The 88px bottom padding is `island.contentInset` (§5) -- content must never be trapped under
 * the floating dock. Individual pages keep their own max-w-app <main>; this wrapper only reserves
 * the vertical space the Island needs, it doesn't own page-level layout.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopBar userEmail={user.email ?? ""} />
      <div className="min-w-0 flex-1 overflow-x-hidden pb-[88px]">{children}</div>
      <Island />
    </div>
  );
}
