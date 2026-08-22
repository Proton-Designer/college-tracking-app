import { DataExportDeletionSection } from "@/components/settings/DataExportDeletionSection";
import { IntegrationsSection } from "@/components/settings/IntegrationsSection";
import { KillHabitsSection } from "@/components/settings/KillHabitsSection";
import { LlmBudgetSection } from "@/components/settings/LlmBudgetSection";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { loadSettingsData } from "./data";

export default async function SettingsPage() {
  const result = await loadSettingsData();

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load settings</p>
        <p className="text-body text-ink-muted">{result.error}</p>
      </main>
    );
  }

  const { profile, killHabits, integrationStatuses, brightspaceFeed, pendingIcsEvents, monthlySpend, hasEverCalledModel } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <h1 className="font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Profile &amp; timezone</h2>
        <ProfileSection profile={profile} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Kill-list habits</h2>
        <KillHabitsSection killHabits={killHabits} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Integrations</h2>
        <IntegrationsSection
          integrationStatuses={integrationStatuses}
          brightspaceFeed={brightspaceFeed}
          pendingIcsEvents={pendingIcsEvents}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">LLM budget &amp; spend</h2>
        <LlmBudgetSection profile={profile} monthlySpend={monthlySpend} hasEverCalledModel={hasEverCalledModel} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Data export &amp; deletion</h2>
        <DataExportDeletionSection userEmail={profile.email} />
      </section>
    </main>
  );
}
