"use client";

import { ClipboardCheck, Compass, GraduationCap, Sun, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/components/ui/cn";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

/**
 * The same five pillars mobile's dock carries, because a narrow browser has a phone's worth of
 * room and should get a phone's information architecture -- not the pre-merge route list.
 *
 * The domains live inside Life here for the same reason they do on a phone: a dock cannot show
 * five pillars and five domains at once. Settings and Calendar are reachable from Today and from
 * Life's School card respectively; the sidebar (from `lg` up) lists everything directly.
 *
 * Insights is gone as a destination: it merged into Review (collision M7), so "how am I doing"
 * has one answer rather than two competing ones.
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/life", label: "Life", icon: Compass },
  { href: "/self", label: "Self", icon: Target },
  { href: "/review", label: "Review", icon: ClipboardCheck },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The primary nav on narrow screens (the sidebar takes over from `lg` up). A floating, detached
 * glass dock: active item shows an accent pill with icon+label, inactive items
 * are icon-only. Content reserves 88px of bottom padding (see (app)/layout.tsx) so nothing
 * is ever trapped under it. Tap targets stay 44x44 regardless of the visual icon size.
 */
export function Island() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-island flex justify-center"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
    >
      <div className="island-surface flex items-center gap-1 rounded-pill p-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={active ? undefined : item.label}
              title={item.label}
              className={cn(
                "flex h-11 min-w-11 items-center justify-center gap-2 rounded-pill px-3",
                "font-sans text-body-s font-medium outline-none transition-[background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
                "focus-visible:outline-offset-2",
                active
                  ? // Ruled exception to §7's blanket "2px accent everywhere": the active item's
                    // own fill IS accent, so an accent ring on it is invisible -- the one color
                    // that can't signal focus here is the one every other control uses. White
                    // reads against both the accent pill and the near-black dock. Scoped to this
                    // one case; don't generalize it.
                    "bg-accent text-accent-on focus-visible:[outline:2px_solid_var(--color-island-ink)]"
                  : "text-island-ink-dim hover:text-island-ink focus-visible:[outline:2px_solid_var(--color-accent)]",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.25 : 2} />
              {active ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
