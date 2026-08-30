import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

/**
 * Wordmark + identity for narrow screens only. From `lg` up the sidebar carries all three of
 * these, so `(app)/layout.tsx` hides this strip rather than repeating them.
 *
 * The Island is primary navigation only, which is why the account-level chrome that isn't a nav
 * destination -- who's signed in, sign out -- lives here rather than being crammed into the dock.
 */
export function TopBar({ userEmail }: { userEmail: string }) {
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link
        href="/today"
        className="font-sans text-title font-semibold tracking-[-0.01em] text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
      >
        Ihsan
      </Link>
      <div className="flex items-center gap-3">
        <span data-testid="today-user-email" className="font-mono text-caption text-ink-faint">
          {userEmail}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
