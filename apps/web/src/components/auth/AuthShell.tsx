import type { ReactNode } from "react";
import Link from "next/link";
import { Aurora } from "@/components/ui/Aurora";
import { Panel } from "@/components/ui/Panel";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-5 py-16">
      {/* §6.0 -- no signed-in user yet on any of these five screens, so there's never a band to
          derive; the resting wash (Aurora's default with no band/stops) is what keeps them from
          reading as a flatter, plainer app than the rest of the product.
          `reach` is wider here than anywhere else in the product on purpose -- see Aurora's
          prop doc. This is the one screen with nothing else on it to protect, and the one the
          reference itself renders as full-bleed iridescence behind a single floating card. */}
      <Aurora reach={1.8} />
      <div className="w-full max-w-sm">
        <Link href="/" className="font-sans text-title font-semibold text-ink">
          CollegeOS
        </Link>
        <h1 className="mt-8 font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-body text-ink-muted">{subtitle}</p> : null}
        {/* This is the one screen where nothing else on the page carries the glass
            language -- no table, no list, no dashboard widgets, just a form. Raised
            tier: it's the single surface on the page, so it should read as elevated,
            not merely present. */}
        <Panel tone="raised" className="mt-8">
          {children}
        </Panel>
        {footer ? <div className="mt-6 text-body-s text-ink-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
