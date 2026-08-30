import { redirect } from "next/navigation";
import { Island } from "@/components/shell/Island";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The shell every authenticated route shares.
 *
 * Two navigations, one information architecture. From `lg` up, the sidebar carries it -- a 72px
 * icon rail that expands to 248px with labels and group headers at `xl`, from LifeOS's pattern
 * (merge directive §6). Below `lg` the sidebar is not rendered at all and the floating Island dock
 * takes over, which is the same set of destinations folded down to a phone's worth of room.
 *
 * The TopBar is likewise narrow-screen only now: at `lg` and up the sidebar already carries the
 * wordmark, the signed-in identity and sign-out, so a second strip repeating them would be chrome
 * for its own sake.
 *
 * `proxy.ts` already redirects an unauthenticated visitor before this renders; the check here only
 * supplies the shell's identity display, not a second protection layer.
 *
 * The two spacing reservations are both structural and neither belongs to a page: `pb-[88px]`
 * below `lg` is `island.contentInset` so content is never trapped under the dock, and the left
 * padding from `lg` up is the rail's own width, since the rail is fixed and out of flow.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col lg:pl-[72px] xl:pl-[248px]">
      <Sidebar userEmail={user.email ?? ""} />
      <div className="lg:hidden">
        <TopBar userEmail={user.email ?? ""} />
      </div>
      <div className="min-w-0 flex-1 overflow-x-hidden pb-[88px] lg:pb-0">{children}</div>
      <div className="lg:hidden">
        <Island />
      </div>
    </div>
  );
}
