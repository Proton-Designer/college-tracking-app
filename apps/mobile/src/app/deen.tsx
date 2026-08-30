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
import { color, domainColor, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConsistencyHeatmap } from "../components/deen/ConsistencyHeatmap";
import { Aurora, Button, EmptyState, Input, Metric, NavLink, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { tintWithAlpha } from "../lib/colorAlpha";
import { formatClockTime, formatShortDate } from "../lib/dates";
import {
  clearTodayPrayer,
  loadDeen,
  logQuran,
  logTodayPrayer,
  markQadaMadeUp,
  setReflection,
  toggleAdhkar,
  toggleSunnah,
} from "../lib/deenActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * Deen, mobile. Mirrors apps/web/src/components/deen/DeenClient.tsx section for section and
 * word for word; both call `loadDeenOverview`, which calls `packages/core`'s prayer engine, so
 * neither platform decides anything about a prayer's status on its own (Law 2).
 *
 * D30's four replacements for the prayer streak ARE this screen: days cleared, on-time rate,
 * the 30-day heatmap and the qada backlog. There is no streak here and there must not be one.
 *
 * **No location is the default state** for all three users (D40). Prayer times then read
 * "awaiting a time", the two headline numbers read "—", and both point at Settings — never a
 * fabricated time, never a 0% verdict on someone who has not been measured. Logging stays
 * fully available: a person knows they prayed whether or not this app knows when Maghrib was.
 */

const STATUS_WORDS: Record<EffectivePrayerStatus, string> = {
  on_time: "On time",
  qada: "Made up",
  missed: "Missed",
  pending: "Not recorded yet",
  upcoming: "Still to come",
};

const STATUS_TONE: Record<EffectivePrayerStatus, string> = {
  on_time: domainColor.deen,
  qada: domainColor.deen,
  missed: color.inkMuted,
  pending: color.inkFaint,
  upcoming: color.inkFaint,
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

/** A small selectable pill. Mirrors DeenClient's local Chip: the three verdicts are a
 *  radiogroup, the presence toggles are not, so the accessibility role differs per use. */
function Chip({
  label,
  selected,
  disabled,
  onPress,
  pressedRole,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  pressedRole: "radio" | "toggle";
}) {
  return (
    <Pressable
      accessibilityRole={pressedRole === "radio" ? "radio" : "button"}
      accessibilityState={pressedRole === "radio" ? { selected, disabled } : { selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { borderColor: domainColor.deen, backgroundColor: tintWithAlpha(domainColor.deen, 0.2) }
          : { borderColor: color.border, backgroundColor: color.surface },
        { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={textStyle("bodyS", selected ? color.ink : color.inkMuted)}>{label}</Text>
    </Pressable>
  );
}

/** Every section on this screen is a Panel whose children need vertical rhythm. Panel's own
 *  `style` lands on its outer shadow wrapper, not on the padded body its children live in, so
 *  the gap goes on an explicit container inside it rather than being silently dropped. */
function DeenPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <View style={styles.panelGap}>{children}</View>
    </Panel>
  );
}

export default function DeenScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [overview, setOverview] = useState<DeenOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState("");
  const [surah, setSurah] = useState("");
  const [juz, setJuz] = useState("");

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadDeen(userId);
    if (result.ok) setOverview(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
      setBusy(true);
      setError(null);
      const result = await action();
      if (!result.ok) {
        setBusy(false);
        setError(result.error ?? fallback);
        return;
      }
      await refresh();
      setBusy(false);
    },
    [refresh],
  );

  const onLog = useCallback(
    (prayer: PrayerName, status: StoredPrayerStatus) => {
      if (userId == null || overview == null) return;
      // Tapping the verdict that is already recorded withdraws it -- the undo for a mis-tap.
      // Once the window has closed the derivation reads `missed` again; withdrawing a
      // statement is not the same as changing the day.
      if (overview.todayStatuses[prayer] === status) {
        void run(() => clearTodayPrayer(userId, prayer), "Could not undo that.");
        return;
      }
      void run(() => logTodayPrayer(userId, prayer, status), "Could not log that prayer.");
    },
    [userId, overview, run],
  );

  const onLogQuran = useCallback(() => {
    if (userId == null) return;
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
    void run(async () => {
      const result = await logQuran(userId, {
        pagesRead: parsedPages,
        surah: surah.trim() === "" ? null : surah.trim(),
        juz: parsedJuz,
      });
      if (result.ok) {
        setPages("");
        setSurah("");
        setJuz("");
      }
      return result;
    }, "Could not log that session.");
  }, [userId, pages, surah, juz, run]);

  const hasLocation = overview?.location != null;
  const sunnahDone = new Set((overview?.sunnahToday ?? []).map((s) => `${s.prayerName}:${s.slot}`));
  const adhkarDone = new Set<AdhkarPeriod>(overview?.adhkarToday ?? []);
  // `onTimeRate` is null exactly when nothing in the window has settled, and a cleared day
  // requires at least one settled prayer -- so this single predicate gates BOTH headline
  // numbers to "—". It never hides a real number, because there isn't one.
  const nothingSettled = overview?.summary.onTimeRate == null;

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <NavLink label="Today" onPress={() => router.back()} />

        <Text style={textStyle("displayM", color.ink)}>Deen</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          {overview == null
            ? "Loading…"
            : hasLocation
              ? (overview.location?.label ?? "Location set")
              : "No location set"}
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading || overview == null ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          <>
            {!hasLocation ? (
              <EmptyState
                title="Prayer times aren't set up yet"
                description="Ihsan works out Fajr through Isha from a latitude and a longitude. Without them it can't say when a window opens or closes, so every prayer below is shown as awaiting a time — nothing is guessed, and nothing counts as missed. You can still log prayers now; they'll be counted the moment a location exists."
                actionLabel="Set your location"
                onAction={() => router.push("/settings")}
              />
            ) : null}

            <DeenPanel title="Today">
              {hasLocation && overview.next ? (
                <Text style={textStyle("bodyS", color.inkMuted)}>
                  {overview.next.isCurrent ? "Now" : "Next"}: {PRAYER_LABELS[overview.next.name]}{" "}
                  {formatClockTime(overview.next.window.start, overview.timezone)}
                </Text>
              ) : null}

              {PRAYER_NAMES.map((prayer) => {
                const status = overview.todayStatuses[prayer];
                const window = overview.todayWindows?.[prayer] ?? null;
                return (
                  <View key={prayer} style={styles.prayerRow}>
                    <View style={styles.prayerHeader}>
                      <Text style={textStyle("bodyL", color.ink)}>{PRAYER_LABELS[prayer]}</Text>
                      <Text style={textStyle("bodyS", color.inkMuted)}>
                        {window
                          ? `${formatClockTime(window.start, overview.timezone)} – ${formatClockTime(window.end, overview.timezone)}`
                          : hasLocation
                            ? "No computable window here today"
                            : "—"}
                      </Text>
                    </View>

                    <Text style={textStyle("label", STATUS_TONE[status])}>
                      {status === "pending" && !hasLocation ? "Awaiting a time" : STATUS_WORDS[status]}
                    </Text>

                    <View accessibilityRole="radiogroup" accessibilityLabel={`${PRAYER_LABELS[prayer]} status`} style={styles.chipRow}>
                      {LOG_OPTIONS.map((option) => (
                        <Chip
                          key={option.value}
                          pressedRole="radio"
                          label={option.label}
                          selected={status === option.value}
                          disabled={busy}
                          onPress={() => onLog(prayer, option.value)}
                        />
                      ))}
                    </View>

                    <View style={styles.chipRow}>
                      {(["before", "after"] as SunnahSlot[]).map((slot) => (
                        <Chip
                          key={slot}
                          pressedRole="toggle"
                          label={`Sunnah ${slot}`}
                          selected={sunnahDone.has(`${prayer}:${slot}`)}
                          disabled={busy}
                          onPress={() => {
                            if (userId == null) return;
                            void run(() => toggleSunnah(userId, prayer, slot), "Could not update that sunnah.");
                          }}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </DeenPanel>

            <DeenPanel title="Adhkar">
              <Text style={textStyle("bodyS", color.inkMuted)}>
                Morning and evening remembrances. Tap to mark, tap again to undo.
              </Text>
              <View style={styles.chipRow}>
                {(["morning", "evening"] as AdhkarPeriod[]).map((period) => (
                  <Chip
                    key={period}
                    pressedRole="toggle"
                    label={period === "morning" ? "Morning" : "Evening"}
                    selected={adhkarDone.has(period)}
                    disabled={busy}
                    onPress={() => {
                      if (userId == null) return;
                      void run(() => toggleAdhkar(userId, period), "Could not update adhkar.");
                    }}
                  />
                ))}
              </View>
            </DeenPanel>

            <QadaPanel
              overview={overview}
              hasLocation={hasLocation}
              disabled={busy}
              onMadeUp={(date, prayer) => {
                if (userId == null) return;
                void run(() => markQadaMadeUp(userId, date, prayer), "Could not record that.");
              }}
            />

            <DeenPanel title="Qur'an">
              <Metric
                label="This week"
                value={overview.quranWeek.pages == null ? "—" : String(overview.quranWeek.pages)}
                {...(overview.quranWeek.pages == null ? {} : { unit: "pages" })}
              />
              <Text style={textStyle("bodyS", color.inkMuted)}>
                {overview.quranWeek.sessions.length === 0
                  ? "No sessions logged since Sunday."
                  : overview.quranWeek.pages == null
                    ? `${overview.quranWeek.sessions.length} session${overview.quranWeek.sessions.length === 1 ? "" : "s"} since Sunday — none of them recorded a page count.`
                    : `${overview.quranWeek.sessions.length} session${overview.quranWeek.sessions.length === 1 ? "" : "s"} since Sunday.`}
              </Text>

              {overview.quranWeek.sessions.map((sessionRow) => (
                <View key={sessionRow.id} style={styles.sessionRow}>
                  <Text style={textStyle("bodyS", color.inkMuted)}>{formatShortDate(sessionRow.local_date)}</Text>
                  <Text style={textStyle("bodyS", color.ink)}>
                    {[
                      sessionRow.pages_read != null ? `${sessionRow.pages_read} pages` : null,
                      sessionRow.surah,
                      sessionRow.juz != null ? `Juz ${sessionRow.juz}` : null,
                    ]
                      .filter((part): part is string => part != null && part !== "")
                      .join(" · ")}
                  </Text>
                </View>
              ))}

              <Input label="Pages" value={pages} onChangeText={setPages} placeholder="4" keyboardType="decimal-pad" />
              <Input label="Surah" value={surah} onChangeText={setSurah} placeholder="Al-Kahf" />
              <Input label="Juz" value={juz} onChangeText={setJuz} placeholder="15" keyboardType="number-pad" />
              <Text style={textStyle("caption", color.inkFaint)}>
                Any one of the three is enough — some people track pages, some a surah, some a juz.
              </Text>
              <Button onPress={onLogQuran} disabled={busy}>
                Log session
              </Button>
            </DeenPanel>

            <DeenPanel title="Reflection">
              <Text style={textStyle("bodyS", color.inkMuted)}>
                How much reflection today — an intensity, not a rating. The question is never how good it was.
              </Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Reflection intensity" style={styles.chipRow}>
                {REFLECTION_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    pressedRole="radio"
                    label={option.label}
                    selected={overview.reflectionToday === option.value}
                    disabled={busy}
                    onPress={() => {
                      if (userId == null) return;
                      void run(() => setReflection(userId, option.value), "Could not record that.");
                    }}
                  />
                ))}
              </View>
              {overview.reflectionToday == null ? (
                <Text style={textStyle("caption", color.inkFaint)}>Nothing recorded today.</Text>
              ) : null}
            </DeenPanel>

            <DeenPanel title="Consistency">
              <View style={styles.metricRow}>
                <Metric
                  label="Days cleared"
                  value={nothingSettled ? "—" : String(overview.summary.clearedDays)}
                  {...(nothingSettled ? {} : { unit: `of ${CONSISTENCY_WINDOW_DAYS}` })}
                />
                <Metric
                  label="On time"
                  value={
                    overview.summary.onTimeRate == null
                      ? "—"
                      : `${Math.round(overview.summary.onTimeRate * 100)}%`
                  }
                />
              </View>
              <Text style={textStyle("bodyS", color.inkMuted)}>
                {nothingSettled
                  ? hasLocation
                    ? `Nothing has settled in the last ${CONSISTENCY_WINDOW_DAYS} days yet, so there is no rate to report. These fill in as windows close.`
                    : "Without a location Ihsan can't tell which prayer windows have closed, so it reports nothing rather than a zero. Set one in Settings and these fill in."
                  : `A day is cleared when all five were on time. Over the last ${CONSISTENCY_WINDOW_DAYS} days.`}
              </Text>
              <ConsistencyHeatmap grid={overview.grid} hasLocation={hasLocation} />
            </DeenPanel>
          </>
        )}
      </ScrollView>
    </View>
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
    <DeenPanel title="Qada">
      <Text style={textStyle("bodyS", color.inkMuted)}>
        {!hasLocation
          ? "Ihsan can't work out which windows have closed without a location, so nothing is listed here — not because there is nothing owed, but because it doesn't know."
          : derivedCount === 0
            ? `Nothing outstanding in the last ${QADA_WINDOW_DAYS} days.`
            : `${derivedCount} to make up from the last ${QADA_WINDOW_DAYS} days. Every one of them has a way back.`}
      </Text>

      {legacyOwed > 0 ? (
        <Text style={textStyle("caption", color.inkFaint)}>
          Plus {legacyOwed} you tracked by hand before Ihsan. Kept separate on purpose — this app can&apos;t verify
          that number, so it doesn&apos;t fold it into one it computed.
        </Text>
      ) : null}

      {hasLocation
        ? groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <View key={group.title} style={styles.qadaGroup}>
                <Text style={textStyle("label", color.inkMuted)}>
                  {group.title} · {group.items.length}
                </Text>
                {group.items.map((item) => (
                  <View key={`${item.date}:${item.prayer}`} style={styles.qadaItem}>
                    <Text style={textStyle("bodyS", color.inkMuted)}>{formatShortDate(item.date)}</Text>
                    <Text style={textStyle("bodyS", color.ink)}>{PRAYER_LABELS[item.prayer]}</Text>
                    <Chip
                      pressedRole="toggle"
                      label="Made up"
                      selected={false}
                      disabled={disabled}
                      onPress={() => onMadeUp(item.date, item.prayer)}
                    />
                  </View>
                ))}
              </View>
            ))
        : null}
    </DeenPanel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  panelGap: { gap: space[3] },
  prayerRow: {
    gap: space[2],
    paddingTop: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  prayerHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[3] },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  sessionRow: { flexDirection: "row", gap: space[3], flexWrap: "wrap" },
  metricRow: { flexDirection: "row", gap: space[8], flexWrap: "wrap" },
  qadaGroup: { gap: space[2] },
  qadaItem: { flexDirection: "row", alignItems: "center", gap: space[3], flexWrap: "wrap" },
});
