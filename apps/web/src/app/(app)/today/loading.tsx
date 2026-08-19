import { Skeleton } from "@/components/ui";

// Mirrors today/page.tsx's real geometry (SCREEN_SPEC §1 states): top bar, header line, the
// Day Trace's 96px band, then the Top 3 / workload / deadline radar column.
export default function TodayLoading() {
  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <div className="flex items-center justify-between">
        <Skeleton width={110} height={22} />
        <Skeleton width={90} height={36} radius="md" />
      </div>

      <div className="flex items-center justify-between">
        <Skeleton width={220} height={30} />
        <Skeleton width={160} height={18} />
      </div>

      <Skeleton height={96} radius="lg" />

      <div className="flex flex-col gap-3">
        <Skeleton width={80} height={14} />
        <Skeleton height={48} radius="md" />
        <Skeleton height={48} radius="md" />
        <Skeleton height={48} radius="md" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton width={100} height={14} />
        <Skeleton height={12} radius="pill" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton width={130} height={14} />
        <Skeleton height={56} radius="md" />
        <Skeleton height={56} radius="md" />
      </div>
    </main>
  );
}
