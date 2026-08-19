"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { SignOutButton } from "./SignOutButton";

interface NavItem {
  href: string;
  label: string;
  /** Shown in place of the label when the rail is collapsed. Three letters, not one --
   *  Courses/Calendar/Insights would otherwise all collapse to the same glyph. */
  abbr: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", abbr: "TDY" },
  { href: "/courses", label: "Courses", abbr: "CRS" },
  { href: "/calendar", label: "Calendar", abbr: "CAL" },
  { href: "/review", label: "Review", abbr: "REV" },
  { href: "/insights", label: "Insights", abbr: "INS" },
  { href: "/settings", label: "Settings", abbr: "SET" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** SCREEN_SPEC §0 — persistent collapsible left rail, content max 1120px. Text-only by
 *  design: no icon set exists in this codebase, and inventing one to fill a nav rail is
 *  exactly the kind of generic-SaaS default DESIGN_SYSTEM §1 rejects. The mono `label`
 *  voice already carries the instrument idiom on its own. */
export function NavRail({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex shrink-0 flex-col justify-between border-r border-hairline bg-surface py-6 transition-[width] duration-150 ease-out",
        collapsed ? "w-16 items-center px-2" : "w-[200px] px-4",
      )}
    >
      <div className={cn("flex flex-col gap-6", collapsed ? "items-center" : undefined)}>
        <Link
          href="/today"
          className="font-mono text-label uppercase tracking-[0.1em] text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
        >
          {collapsed ? "C" : "CollegeOS"}
        </Link>

        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-sm border-l-2 py-2 text-body-s outline-none transition-colors duration-90 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                    collapsed ? "justify-center px-1 font-mono text-caption tracking-[0.05em]" : "px-3",
                    active
                      ? "border-l-accent bg-accent-wash font-medium text-ink"
                      : "border-l-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  {collapsed ? item.abbr : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cn("flex flex-col gap-3", collapsed ? "items-center" : undefined)}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="w-fit rounded-sm px-2 py-1 font-mono text-caption text-ink-faint outline-none transition-colors duration-90 hover:text-ink focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
        >
          {collapsed ? "›" : "‹ Collapse"}
        </button>
        {!collapsed ? (
          <span data-testid="today-user-email" className="truncate font-mono text-caption text-ink-faint">
            {userEmail}
          </span>
        ) : null}
        <SignOutButton compact={collapsed} />
      </div>
    </nav>
  );
}
