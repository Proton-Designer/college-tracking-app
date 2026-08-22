import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

/**
 * Wordmark + identity, separate from the Island: the island (§5) is primary navigation only,
 * so the account-level chrome that isn't a nav destination -- who's signed in, sign out --
 * lives in a slim top strip instead of being crammed into the dock.
 */
export function TopBar({ userEmail }: { userEmail: string }) {
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link
        href="/today"
        className="font-sans text-title font-semibold tracking-[-0.01em] text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
      >
        CollegeOS
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
