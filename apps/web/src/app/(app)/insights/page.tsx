import { EmptyState } from "@/components/ui";

export default function InsightsPage() {
  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-10">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">Insights</h1>
      <EmptyState
        title="Not built yet"
        description="This screen will group insights by confidence — measured, indicated, hypothesis — plus the task-duration calibration table, friction cause distribution, bounce-back trend, and the planning-vs-execution quadrant. Nothing here is real until it's built."
      />
    </main>
  );
}
