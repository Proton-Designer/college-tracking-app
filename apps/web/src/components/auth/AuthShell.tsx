import type { ReactNode } from "react";
import Link from "next/link";
import { Aurora } from "@/components/ui/Aurora";

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
          reading as a flatter, plainer app than the rest of the product. */}
      <Aurora />
      <div className="w-full max-w-sm">
        <Link href="/" className="font-sans text-title font-semibold text-ink">
          CollegeOS
        </Link>
        <h1 className="mt-8 font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-body text-ink-muted">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-body-s text-ink-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
