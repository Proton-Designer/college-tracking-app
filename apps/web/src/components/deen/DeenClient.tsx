"use client";

import { CONSISTENCY_WINDOW_DAYS, QADA_WINDOW_DAYS, type AdhkarPeriod, type DeenOverview, type ReflectionIntensity, type SunnahSlot } from "@collegeos/api";
import {
  PRAYER_LABELS,
  PRAYER_NAMES,
  type EffectivePrayerStatus,
  type LocalDate,
  type PrayerName,
  type QadaItem,
  type StoredPrayerStatus,
} from "@collegeos/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  clearTodayPrayerAction,
  logQuranSessionAction,
  logTodayPrayerAction,
  markQadaMadeUpAction,
  setReflectionAction,
  toggleAdhkarAction,
  toggleSunnahAction,
} from "@/app/(app)/deen/deenActions";
import { ConsistencyHeatmap } from "@/components/deen/ConsistencyHeatmap";
import { Button, EmptyState, Input, Metric, Panel } from "@/components/ui";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { cn } from "@/components/ui/cn";
import { formatClockTime, formatShortDate } from "@/lib/dates";

/**
 * Deen's interaction layer. One tap logs a prayer; tapping the same verdict again withdraws
 * it. Nothing on this screen scolds: a missed prayer is stated plainly and the thing sitting
 * next to it is the way back (qada), which is the mechanic D30 kept when it dropped the streak.
 *
 * **The no-location state is the default, not the exception.** With no coordinates on the
 * profile, `resolvePrayerStatuses` returns `pending` for everything and `onTimeRate` is null.
 * This component renders that as "awaiting a time" and "—" and points at Settings — never a
 * fabricated 5:00 AM, never a 0% that reads as a verdict on someone who has not been measured
 * (D40). Logging stays fully available: a person knows they prayed whether or not this app
 * knows when Maghrib was.
 *
 * **There is no streak here and there must not be one** (D30). The surfaces are days cleared,
 * on-time rate, the heatmap and the backlog.
 */

const STATUS_WORDS: Record<EffectivePrayerStatus, string> = {
  on_time: "On time",
  qada: "Made up",
  missed: "Missed",
  pending: "Not recorded yet",
  upcoming: "Still to come",
};

const STATUS_TONE: Record<EffectivePrayerStatus, string> = {
  on_time: "text-domain-deen",
  qada: "text-domain-deen",
  missed: "text-ink-muted",
  pending: "text-ink-faint",
  upcoming: "text-ink-faint",
};

const LOG_OPTIONS: { value: StoredPrayerStatus; label: string }[] = [
  { value: "on_time", label: "On time" },
  { value: "qada", label: "Qada" },
  { value: "missed", label: "Missed" },
];

const REFLECTION_OPTIONS: { value: ReflectionIntensity; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" },
];

/** A small selectable pill. Same shape as ui/ChipGroup's chip, but each one here is an
 *  independent action rather than a member of a single-select radiogroup — a prayer's three
 *  verdicts are a radiogroup, the sunnah slots are not. */
function Chip({
  label,
  selected,
  disabled,
  onClick,
  pressedRole,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** "radio" for the one-of-three verdicts, "toggle" for the independent presence flags. */
  pressedRole: "radio" | "toggle";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      {...(pressedRole === "radio" ? { role: "radio", "aria-checked": selected } : { "aria-pressed": selected })}
      className={cn(
        "rounded-pill border px-3 py-1 font-sans text-body-s",
        "outline-none transition-colors duration-90",
        "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
        selected
          ? "border-domain-deen bg-domain-deen/20 text-ink"
          : "border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {label}
    </button>
  );
}

export function DeenClient({ overview }: { overview: DeenOverview }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [pages, setPages] = useState("");
  const [surah, setSurah] = useState("");
  const [juz, setJuz] = useState("");

  const hasLocation = overview.location != null;
  const sunnahDone = new Set(overview.sunnahToday.map((s) => `${s.prayerName}:${s.slot}`));
  const adhkarDone = new Set<AdhkarPeriod>(overview.adhkarToday);
  // `onTimeRate` is null exactly when nothing in the window has settled, and a cleared day
  // requires at least one settled prayer -- so this single predicate is what gates BOTH
  // headline numbers to "—". It never hides a real number, because there isn't one.
  const nothingSettled = overview.summary.onTimeRate === null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? fallback);
        return;
      }
      router.refresh();
    });
  }

  function handleLog(prayer: PrayerName, status: StoredPrayerStatus) {
    const current = overview.todayStatuses[prayer];
    // Tapping the verdict that is already recorded withdraws it, which is the undo for a
    // mis-tap. Once the window has closed the derivation reads `missed` again -- withdrawing a
    // statement is not the same as changing the day.
    if (current === status) {
      run(() => clearTodayPrayerAction(prayer), "Could not undo that.");
      return;
    }
    run(() => logTodayPrayerAction(prayer, status), "Could not log that prayer.");
  }

  function handleQuranSubmit() {
    const parsedPages = pages.trim() === "" ? null : Number(pages);
    const parsedJuz = juz.trim() === "" ? null : Number(juz);
    if (parsedPages != null && (Number.isNaN(parsedPages) || parsedPages <= 0)) {
      setError("Pages read has to be a number greater than zero.");
      return;
    }
    if (parsedJuz != null && (!Number.isInteger(parsedJuz) || parsedJuz < 1 || parsedJuz > 30)) {
      setError("Juz has to be a whole number between 1 and 30.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await logQuranSessionAction({
        pagesRead: parsedPages,
        surah: surah.trim() === "" ? null : surah.trim(),
        juz: parsedJuz,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not log that session.");
        return;
      }
      setPages("");
      setSurah("");
      setJuz("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      {!hasLocation ? (
        <EmptyState
          title="Prayer times aren't set up yet"
          description="Ihsan works out Fajr through Isha from a latitude and a longitude. Without them it can't say when a window opens or closes, so every prayer below is shown as awaiting a time — nothing is guessed, and nothing counts as missed. You can still log prayers now; they'll be counted the moment a location exists."
          action={
            <Link href="/settings" className={buttonClassName("secondary")}>
              Set your location
            </Link>
          }
        />
      ) : null}

      <Panel title="Today" className="flex flex-col gap-4">
        {hasLocation && overview.next ? (
          <p className="text-body-s text-ink-muted">
            {overview.next.isCurrent ? "Now" : "Next"}:{" "}
            <span className="text-ink">{PRAYER_LABELS[overview.next.name]}</span>{" "}
            <span className="font-mono tabular-nums">
              {formatClockTime(overview.next.window.start, overview.timezone)}
            </span>
          </p>
        ) : null}

        <ul className="flex flex-col gap-4">
          {PRAYER_NAMES.map((prayer) => {
            const status = overview.todayStatuses[prayer];
            const window = overview.todayWindows?.[prayer] ?? null;
            return (
              <li key={prayer} className="flex flex-col gap-2 border-t border-hairline pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-body-l text-ink">{PRAYER_LABELS[prayer]}</span>
                  <span className="font-mono text-body-s tabular-nums text-ink-muted">
                    {window
                      ? `${formatClockTime(window.start, overview.timezone)} – ${formatClockTime(window.end, overview.timezone)}`
                      : hasLocation
                        ? "No computable window here today"
                        : "—"}
                  </span>
                </div>

                <p className={cn("font-mono text-label uppercase tracking-[0.1em]", STATUS_TONE[status])}>
                  {status === "pending" && !hasLocation ? "Awaiting a time" : STATUS_WORDS[status]}
                </p>

                <div role="radiogroup" aria-label={`${PRAYER_LABELS[prayer]} status`} className="flex flex-wrap gap-2">
                  {LOG_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      pressedRole="radio"
                      label={option.label}
                      selected={status === option.value}
                      disabled={isPending}
                      onClick={() => handleLog(prayer, option.value)}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["before", "after"] as SunnahSlot[]).map((slot) => (
                    <Chip
                      key={slot}
                      pressedRole="toggle"
                      label={`Sunnah ${slot}`}
                      selected={sunnahDone.has(`${prayer}:${slot}`)}
                      disabled={isPending}
                      onClick={() =>
                        run(() => toggleSunnahAction(prayer, slot), "Could not update that sunnah.")
                      }
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Adhkar" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">Morning and evening remembrances. Tap to mark, tap again to undo.</p>
        <div className="flex flex-wrap gap-2">
          {(["morning", "evening"] as AdhkarPeriod[]).map((period) => (
            <Chip
              key={period}
              pressedRole="toggle"
              label={period === "morning" ? "Morning" : "Evening"}
              selected={adhkarDone.has(period)}
              disabled={isPending}
              onClick={() => run(() => toggleAdhkarAction(period), "Could not update adhkar.")}
            />
          ))}
        </div>
      </Panel>

      <QadaPanel
        overview={overview}
        hasLocation={hasLocation}
        disabled={isPending}
        onMadeUp={(date, prayer) => run(() => markQadaMadeUpAction(date, prayer), "Could not record that.")}
      />

      <Panel title="Qur'an" className="flex flex-col gap-4">
        <Metric
          label="This week"
          value={overview.quranWeek.pages == null ? "—" : overview.quranWeek.pages}
          {...(overview.quranWeek.pages == null ? {} : { unit: "pages" })}
        />
        <p className="text-body-s text-ink-muted">
          {overview.quranWeek.sessions.length === 0
            ? "No sessions logged since Sunday."
            : overview.quranWeek.pages == null
              ? `${overview.quranWeek.sessions.length} session${overview.quranWeek.sessions.length === 1 ? "" : "s"} since Sunday — none of them recorded a page count.`
              : `${overview.quranWeek.sessions.length} session${overview.quranWeek.sessions.length === 1 ? "" : "s"} since Sunday.`}
        </p>

        {overview.quranWeek.sessions.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {overview.quranWeek.sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap gap-x-3 text-body-s text-ink-muted">
                <span className="font-mono tabular-nums">{formatShortDate(session.local_date)}</span>
                <span className="text-ink">
                  {[
                    session.pages_read != null ? `${session.pages_read} pages` : null,
                    session.surah,
                    session.juz != null ? `Juz ${session.juz}` : null,
                  ]
                    .filter((part): part is string => part != null && part !== "")
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Pages" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="4" inputMode="decimal" />
          <Input label="Surah" value={surah} onChange={(e) => setSurah(e.target.value)} placeholder="Al-Kahf" />
          <Input label="Juz" value={juz} onChange={(e) => setJuz(e.target.value)} placeholder="15" inputMode="numeric" />
        </div>
        <p className="text-caption text-ink-faint">Any one of the three is enough — some people track pages, some a surah, some a juz.</p>
        <div>
          <Button onClick={handleQuranSubmit} loading={isPending}>
            Log session
          </Button>
        </div>
      </Panel>

      <Panel title="Reflection" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">
          How much reflection today — an intensity, not a rating. The question is never how good it was.
        </p>
        <div role="radiogroup" aria-label="Reflection intensity" className="flex flex-wrap gap-2">
          {REFLECTION_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              pressedRole="radio"
              label={option.label}
              selected={overview.reflectionToday === option.value}
              disabled={isPending}
              onClick={() => run(() => setReflectionAction(option.value), "Could not record that.")}
            />
          ))}
        </div>
        {overview.reflectionToday == null ? (
          <p className="text-caption text-ink-faint">Nothing recorded today.</p>
        ) : null}
      </Panel>

      <Panel title="Consistency" className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-8">
          <Metric
            label="Days cleared"
            value={nothingSettled ? "—" : overview.summary.clearedDays}
            {...(nothingSettled ? {} : { unit: `of ${CONSISTENCY_WINDOW_DAYS}` })}
          />
          <Metric
            label="On time"
            value={overview.summary.onTimeRate == null ? "—" : `${Math.round(overview.summary.onTimeRate * 100)}%`}
          />
        </div>
        {nothingSettled ? (
          <p className="text-body-s text-ink-muted">
            {hasLocation
              ? `Nothing has settled in the last ${CONSISTENCY_WINDOW_DAYS} days yet, so there is no rate to report. These fill in as windows close.`
              : "Without a location Ihsan can't tell which prayer windows have closed, so it reports nothing rather than a zero. Set one in Settings and these fill in."}
          </p>
        ) : (
          <p className="text-body-s text-ink-muted">
            A day is cleared when all five were on time. Over the last {CONSISTENCY_WINDOW_DAYS} days.
          </p>
        )}
        <ConsistencyHeatmap grid={overview.grid} hasLocation={hasLocation} />
      </Panel>
    </div>
  );
}

/** The backlog, in the three recency buckets `bucketQadaBacklog` produces. Finite, visible and
 *  clearable — which is the whole reason D30 could drop the streak without losing anything. */
function QadaPanel({
  overview,
  hasLocation,
  disabled,
  onMadeUp,
}: {
  overview: DeenOverview;
  hasLocation: boolean;
  disabled: boolean;
  onMadeUp: (date: LocalDate, prayer: PrayerName) => void;
}) {
  const { buckets, derivedCount, legacyOwed } = overview.qada;
  const groups: { title: string; items: QadaItem[] }[] = [
    { title: "Last 7 days", items: buckets.last7 },
    { title: "Earlier this month", items: buckets.earlierThisMonth },
    { title: "Older", items: buckets.older },
  ];

  return (
    <Panel title="Qada" className="flex flex-col gap-4">
      {!hasLocation ? (
        <p className="text-body-s text-ink-muted">
          Ihsan can&apos;t work out which windows have closed without a location, so nothing is listed here — not
          because there is nothing owed, but because it doesn&apos;t know.
        </p>
      ) : derivedCount === 0 ? (
        <p className="text-body-s text-ink-muted">Nothing outstanding in the last {QADA_WINDOW_DAYS} days.</p>
      ) : (
        <p className="text-body-s text-ink-muted">
          <span className="font-mono tabular-nums text-ink">{derivedCount}</span> to make up from the last{" "}
          {QADA_WINDOW_DAYS} days.
          Every one of them has a way back.
        </p>
      )}

      {legacyOwed > 0 ? (
        <p className="text-caption text-ink-faint">
          Plus <span className="font-mono tabular-nums">{legacyOwed}</span> you tracked by hand before Ihsan. Kept
          separate on purpose — this app can&apos;t verify that number, so it doesn&apos;t fold it into one it
          computed.
        </p>
      ) : null}

      {hasLocation
        ? groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <h4 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                  {group.title} · {group.items.length}
                </h4>
                <ul className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <li key={`${item.date}:${item.prayer}`} className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-body-s tabular-nums text-ink-muted">
                        {formatShortDate(item.date)}
                      </span>
                      <span className="text-body-s text-ink">{PRAYER_LABELS[item.prayer]}</span>
                      <Chip
                        pressedRole="toggle"
                        label="Made up"
                        selected={false}
                        disabled={disabled}
                        onClick={() => onMadeUp(item.date, item.prayer)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))
        : null}
    </Panel>
  );
}
