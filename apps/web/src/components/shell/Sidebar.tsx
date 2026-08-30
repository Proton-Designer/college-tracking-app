"use client";

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Compass,
  GraduationCap,
  Moon,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/components/ui/cn";
import { SignOutButton } from "./SignOutButton";

/**
 * The primary navigation on web, from LifeOS's sidebar pattern (merge directive §6: his layout
 * grammar wins, not just his colours).
 *
 * **Why a sidebar replaces the dock here and not on mobile.** The five-tab structure and this
 * sidebar are the same information architecture; the sidebar is that architecture *unfolded*. A
 * dock can show five destinations, so on a phone the five tabs are the whole IA. A 1440px screen
 * can show all of them plus the domains inside Life at once, and hiding them behind a hub screen
 * on a screen with room is a phone constraint imported into a desktop.
 *
 * **Navigation grows as pillars ship.** The groups below are the shape the app is growing into,
 * and an entry appears here on the day its destination becomes real -- Life's five domains in
 * Phase 2, Learn in Phase 4, Self in Phase 5. A nav item that leads to a "coming soon" page is not
 * an honest empty state (D40), it is scaffolding wearing one.
 *
 * Responsive behaviour matches his: a 72px icon rail from `lg`, expanding to 248px with labels and
 * group headers at `xl`. Below `lg` this component renders nothing and the Island dock takes over
 * -- see `(app)/layout.tsx`.
 */

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /**
   * The domain colour this destination tints its active state with, as a CSS custom property
   * name. Domain colour is information (tokens.ts): a Life destination tints by which domain it
   * is, and everything else uses the neutral accent.
   */
  tint?: string;
}

interface NavGroup {
  /** Rendered as an eyebrow at `xl`, and as a hairline separator in the icon rail. */
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/today", label: "Today", icon: Sun },
      { href: "/learn", label: "Learn", icon: GraduationCap },
      { href: "/self", label: "Self", icon: Compass },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/week", label: "Week", icon: BarChart3 },
    ],
  },
  {
    // Life is the group the merged IA puts the five domains in. It opens with the two that
    // are real -- Deen, and School, which is the Courses surface under the name the merged IA
    // gives it (the destination is unchanged; only the label moved into its domain). Business,
    // Fitness and Work join on the day their destinations exist, not before: a nav item leading
    // to a "coming soon" page is scaffolding wearing an empty state's clothes (D40).
    title: "Life",
    items: [
      { href: "/deen", label: "Deen", icon: Moon, tint: "--color-domain-deen" },
      { href: "/courses", label: "School", icon: BookOpen, tint: "--color-domain-school" },
    ],
  },
  {
    title: "Review",
    items: [{ href: "/review", label: "Review", icon: ClipboardCheck }],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Primary"
      className={cn(
        "hidden lg:flex",
        // The rail is fixed so the page scrolls under it; content reserves the width in layout.
        "fixed inset-y-0 left-0 z-sticky flex-col border-r border-hairline bg-surface",
        "w-[72px] xl:w-[248px]",
      )}
    >
      <div className="flex h-16 items-center gap-3 px-5 xl:px-6">
        <Link
          href="/today"
          className={cn(
            "flex items-center gap-3 rounded-md outline-none",
            "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
          )}
        >
          {/* The mark: a filled dot in the accent, which is also the shape the Island's active
              pill uses. Small enough to read as a mark rather than a logo we do not have. */}
          <span aria-hidden className="size-2.5 shrink-0 rounded-pill bg-accent" />
          <span className="hidden font-sans text-title font-semibold tracking-[-0.01em] text-ink xl:inline">
            Ihsan
          </span>
        </Link>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-2 xl:px-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <h2
              className={cn(
                "hidden px-2 pb-1 font-mono text-label uppercase tracking-[0.12em] text-ink-faint",
                "xl:block",
              )}
            >
              {group.title}
            </h2>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-2 outline-none",
                    "font-sans text-body transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
                    "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                    active
                      ? "bg-surface-sunken font-medium text-ink"
                      : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                  )}
                  style={
                    active && item.tint
                      ? // Domain tint on the active item, matching LifeOS. `color-mix` keeps it a
                        // wash rather than a fill: the destination is marked, not shouted.
                        { backgroundColor: `color-mix(in srgb, var(${item.tint}) 14%, transparent)` }
                      : undefined
                  }
                >
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center"
                    style={active && item.tint ? { color: `var(${item.tint})` } : undefined}
                  >
                    <Icon size={18} strokeWidth={active ? 2.25 : 2} />
                  </span>
                  <span className="hidden truncate xl:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/*
        Capture is a persistent action, not a destination -- the directive asks for it reachable
        from anywhere. It sits with the nav rather than in it, above the identity footer, and is
        the one saturated fill in the rail.
      */}
      <div className="px-3 pb-3 xl:px-4">
        <Link
          href="/today?capture=1"
          className={cn(
            "flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-2 outline-none",
            "font-sans text-body font-medium text-accent-on",
            "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-accent-hover",
            "focus-visible:[outline:2px_solid_var(--color-ink)] focus-visible:outline-offset-2",
          )}
          title="Capture"
        >
          <Plus size={18} strokeWidth={2.25} aria-hidden />
          <span className="hidden xl:inline">Capture</span>
        </Link>
      </div>

      <div className="flex flex-col gap-1 border-t border-hairline px-3 py-3 xl:px-4">
        <span
          data-testid="sidebar-user-email"
          className="hidden truncate font-mono text-caption text-ink-faint xl:block"
          title={userEmail}
        >
          {userEmail}
        </span>
        <div className="flex justify-center xl:justify-start">
          <SignOutButton compact />
        </div>
      </div>
    </aside>
  );
}
