"use client";

import { BarChart3, BookOpen, CalendarDays, ClipboardCheck, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/components/ui/cn";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * DESIGN_LANGUAGE_V2 §5 — the primary nav on both platforms. A floating, detached,
 * near-black glass dock: active item shows an accent pill with icon+label, inactive items
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
                "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                active ? "bg-accent text-white" : "text-island-ink-dim hover:text-island-ink",
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
