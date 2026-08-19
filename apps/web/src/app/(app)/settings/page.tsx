import { EmptyState } from "@/components/ui";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-10">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">Settings</h1>
      <EmptyState
        title="Not built yet"
        description="This screen will hold profile and timezone, integrations (WHOOP, Brightspace, RescueTime, calendar), notification preferences, kill-habit definitions, commitment escalation levels, LLM budget, and data export and deletion. Nothing here is real until it's built."
      />
    </main>
  );
}
