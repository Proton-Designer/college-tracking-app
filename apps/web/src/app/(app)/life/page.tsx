import Link from "next/link";
import { loadLifeHub, type LifeHub } from "@collegeos/api";
import { DOMAIN_LABELS, type LifeDomain, type LocalDate } from "@collegeos/core";
import { Aurora, PageHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { daysRemainingLabel } from "@/lib/dates";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Life hub, web: five domain cards, each with its domain colour and a live one-line
 * status, each linking to its own surface.
 *
 * **Why it exists on desktop at all.** The sidebar already lists the five domains at `xl`, so
 * this is not the only way in — it is the place where the five say what state they are in at
 * once, which a nav rail cannot do.
 *
 * **Domain colour is information here, not decoration** (DESIGN_LANGUAGE_V3 §1.3): the tint on
 * a card identifies which domain it is, and it is always accompanied by the domain's name, so
 * nothing on this page carries meaning by colour alone.
 *
 * **The status lines are composed here, from facts** (`loadLifeHub` returns counts, dates and
 * booleans and no sentences). Each one distinguishes "never set up" from "set up and empty",
 * because a card that shows `0` for both tells one of them a lie (D40). Mobile's
 * `apps/mobile/src/app/(tabs)/life.tsx` composes the same sentences from the same facts.
 *
 * School's card links to `/courses`: the destination is unchanged, only the label moved into
 * the domain the merged IA puts it in.
 */

interface DomainCard {
  domain: LifeDomain;
  href: string;
  status: string;
  /** Static class names: Tailwind cannot see a class built by string interpolation. */
  accent: string;
  border: string;
}

function deenStatus(hub: LifeHub): string {
  if (!hub.deen.hasLocation) return "Prayer times aren't set up yet";
  if (hub.deen.loggedToday === 0) return "Nothing logged today yet";
  return `${hub.deen.loggedToday} of ${hub.deen.totalPrayers} recorded today`;
}

function businessStatus(hub: LifeHub): string {
  const { mitsToday, openTasks, hasWeeklyGoal } = hub.business;
  if (!hasWeeklyGoal && openTasks === 0 && mitsToday === 0) return "Nothing tagged business yet";
  const parts: string[] = [];
  if (mitsToday > 0) parts.push(`${mitsToday} MIT${mitsToday === 1 ? "" : "s"} today`);
  parts.push(openTasks === 0 ? "nothing open" : `${openTasks} open`);
  parts.push(hasWeeklyGoal ? "focus set" : "no focus this week");
  return parts.join(" · ");
}

function schoolStatus(hub: LifeHub, today: LocalDate): string {
  if (hub.school.courses === 0) return "No courses yet";
  if (hub.school.openDeliverables === 0) return `${hub.school.courses} courses · nothing open`;
  const next = hub.school.nextDueDate;
  return `${hub.school.openDeliverables} open · next ${next == null ? "unscheduled" : daysRemainingLabel(today, next)}`;
}

function fitnessStatus(hub: LifeHub): string {
  const { hasActivePlan, confirmedWorkoutsThisWeek, hasOpenWorkoutToday, exerciseCount } = hub.fitness;
  if (!hasActivePlan && exerciseCount === 0) return "Not set up yet";
  if (!hasActivePlan) return `${exerciseCount} movements · no plan yet`;
  if (confirmedWorkoutsThisWeek === 0) {
    return hasOpenWorkoutToday ? "A workout is open today" : "Nothing confirmed this week yet";
  }
  return `${confirmedWorkoutsThisWeek} confirmed this week${hasOpenWorkoutToday ? " · one open today" : ""}`;
}

function workStatus(hub: LifeHub): string {
  const { activeTargets, blockedTargets, shiftsToday, hasAnyShift } = hub.work;
  if (activeTargets === 0 && blockedTargets === 0 && !hasAnyShift) return "Nothing in the pipeline yet";
  const parts: string[] = [];
  parts.push(activeTargets === 0 ? "nothing active" : `${activeTargets} active`);
  if (blockedTargets > 0) parts.push(`${blockedTargets} blocked`);
  parts.push(!hasAnyShift ? "no schedule entered" : shiftsToday === 0 ? "no shift today" : `${shiftsToday} shift${shiftsToday === 1 ? "" : "s"} today`);
  return parts.join(" · ");
}

function buildCards(hub: LifeHub): DomainCard[] {
  return [
    {
      domain: "deen",
      href: "/deen",
      status: deenStatus(hub),
      accent: "text-domain-deen",
      border: "border-l-domain-deen",
    },
    {
      domain: "business",
      href: "/business",
      status: businessStatus(hub),
      accent: "text-domain-business",
      border: "border-l-domain-business",
    },
    {
      domain: "school",
      href: "/courses",
      status: schoolStatus(hub, hub.today),
      accent: "text-domain-school",
      border: "border-l-domain-school",
    },
    {
      domain: "fitness",
      href: "/fitness",
      status: fitnessStatus(hub),
      accent: "text-domain-fitness",
      border: "border-l-domain-fitness",
    },
    {
      domain: "work",
      href: "/work",
      status: workStatus(hub),
      accent: "text-domain-work",
      border: "border-l-domain-work",
    },
  ];
}

export default async function LifePage() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not signed in.</p>
      </main>
    );
  }

  const hub = await loadLifeHub(client, user.id);
  if (!hub.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Life</p>
        <p className="text-body text-ink-muted">{hub.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const cards = buildCards(hub.data);

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader title="Life" context="Five domains, one system" />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.domain}>
            <Link
              href={card.href}
              className={cn(
                "glass flex h-full flex-col gap-2 rounded-lg border border-l-4 border-hairline p-5",
                card.border,
                "outline-none transition-[filter] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
                "hover:brightness-[1.05]",
                "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
              )}
            >
              <span className={cn("font-mono text-label uppercase tracking-[0.1em]", card.accent)}>
                {DOMAIN_LABELS[card.domain]}
              </span>
              <span className="text-body text-ink">{card.status}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-caption text-ink-faint">
        Each line is what that domain actually knows right now. Where a domain has never been set up it says so rather
        than reporting a zero.
      </p>
    </main>
  );
}
