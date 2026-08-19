import { getServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

// Placeholder authenticated home — proves route protection + session persistence for L3. The
// real Today screen (with the Day Trace, §6.1) is built once, deliberately, when Today ships.
export default async function TodayPage() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  return (
    <main className="flex flex-1 flex-col gap-4 px-8 py-12">
      <p className="text-label uppercase tracking-[0.1em] text-ink-faint">Today</p>
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">
        Signed in
      </h1>
      <p data-testid="today-user-email" className="text-body text-ink-muted">
        {user?.email}
      </p>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
