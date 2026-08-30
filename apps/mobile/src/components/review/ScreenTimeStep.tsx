import type { ScreenTimeExtractionRow, ScreenTimeStepView } from "@collegeos/api";
import { unresolvedFields, type SeriesSummary, type WeekPoint } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, EmptyState, Input, Panel } from "../ui";
import { textStyle } from "../../design/typography";
import { confirmScreenTime, uploadScreenTime } from "../../lib/screenTimeActions";

/**
 * The Sunday review's screen-time step (D51), mobile. Mirrors web's
 * `components/review/ScreenTimeStep.tsx` in copy, order and rules — that file's header carries the
 * full reasoning. The four rules, since they are the ones a redesign would quietly break:
 *
 * 1. **The offer is an INVITATION, never a nag** — one sentence, one control, no badge, no
 *    counter, no escalation, and copy that says out loud that skipping costs nothing.
 * 2. **A missed week is a GAP** — rendered as an outlined empty slot labelled "not reported",
 *    never a zero-height bar and never interpolated. No consecutive-week counter exists here.
 * 3. **No guessing (D10)** — an unread value is an empty field; confirming is blocked by marking
 *    the fields and disabling the button, never by a refusal after the fact.
 * 4. **Nothing is shared** — C9 holds; there is no share control and no design toward one.
 */
export interface ScreenTimeStepProps {
  userId: string;
  view: ScreenTimeStepView;
  onChanged: () => void | Promise<void>;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function itemLabel(row: ScreenTimeExtractionRow): string {
  if (row.item_type === "total") return row.label ?? "Daily average";
  return row.label ?? "Unnamed";
}

export function ScreenTimeStep({ userId, view, onChanged }: ScreenTimeStepProps) {
  const [staged, setStaged] = useState<ScreenTimeExtractionRow[]>(view.staged);
  const [uploadId, setUploadId] = useState<number | null>(view.upload?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onPick() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/png", "image/jpeg"],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0]!;

    setBusy(true);
    setMessage(null);
    const result = await uploadScreenTime(userId, view.weekStart, {
      uri: asset.uri,
      name: asset.name,
      ...(asset.mimeType != null ? { mimeType: asset.mimeType } : {}),
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setUploadId(result.data.uploadId);
    if (!result.data.parse.ok) {
      setMessage(`The screenshot saved, but reading it didn't run: ${result.data.parse.error}`);
      return;
    }
    setStaged(result.data.parse.items);
  }

  return (
    <View style={styles.container}>
      {staged.length > 0 && uploadId != null ? (
        <ConfirmStaged
          userId={userId}
          uploadId={uploadId}
          staged={staged}
          onConfirmed={async () => {
            setStaged([]);
            await onChanged();
          }}
        />
      ) : (
        <Panel>
          <View style={styles.block}>
            <Text style={textStyle("label", color.inkMuted)}>
              {view.outstanding ? "THIS WEEK'S SCREEN TIME" : "THIS WEEK IS IN"}
            </Text>
            {view.outstanding ? (
              // THE INVITATION. One sentence, one control, and an explicit statement that skipping
              // costs nothing — which is what keeps this from becoming a chore (D51).
              <Text style={textStyle("body", color.inkMuted)}>
                Open Settings → Screen Time, screenshot the week, and add it here when you want to
                look. Skipping a week just leaves a gap in the series — nothing breaks.
              </Text>
            ) : (
              <Text style={textStyle("body", color.inkMuted)}>
                {view.series.summary.latest?.minutes != null
                  ? `${formatMinutes(view.series.summary.latest.minutes)} a day, confirmed. `
                  : "Confirmed. "}
                Re-upload if you want to correct the reading.
              </Text>
            )}
            <Button variant="secondary" onPress={() => void onPick()} disabled={busy}>
              {view.outstanding ? "Add the screenshot" : "Re-upload"}
            </Button>
            {message != null ? <Text style={textStyle("bodyS", color.inkMuted)}>{message}</Text> : null}
          </View>
        </Panel>
      )}

      <WeeklySeries points={view.series.points} summary={view.series.summary} />
    </View>
  );
}

/**
 * The confirm step. `unresolvedFields` from `packages/core` decides what still blocks — the same
 * function the data layer runs before it writes anything, so the button and the write agree by
 * construction rather than by two copies of one rule.
 */
function ConfirmStaged({
  userId,
  uploadId,
  staged,
  onConfirmed,
}: {
  userId: string;
  uploadId: number;
  staged: ScreenTimeExtractionRow[];
  onConfirmed: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(staged.map((row) => [row.id, row.minutes == null ? "" : String(row.minutes)])),
  );

  const values = staged.map((row) => {
    const raw = (drafts[row.id] ?? "").trim();
    const parsed = raw === "" ? null : Number(raw);
    const minutes = parsed != null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    return { row, minutes, staged: { label: row.label, minutes, needsInput: minutes == null } };
  });

  const outstanding = new Set(
    unresolvedFields(values.map((v) => v.staged)).map(
      (value) => values.find((v) => v.staged === value)!.row.id,
    ),
  );
  const outstandingLabels = values.filter((v) => outstanding.has(v.row.id)).map((v) => itemLabel(v.row));

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const result = await confirmScreenTime(
      userId,
      uploadId,
      values.map((v) => ({ extractionId: v.row.id, minutes: v.minutes, label: v.row.label })),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // A `blocked` result cannot be reached from a disabled button; if the two ever disagree the
    // server wins and the fields stay marked rather than a refusal appearing.
    if (result.data.kind === "confirmed") await onConfirmed();
  }

  return (
    <Panel>
      <View style={styles.block}>
        <Text style={textStyle("label", color.inkMuted)}>CHECK THE READING</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Nothing is recorded until you confirm. Numbers are in minutes.
        </Text>

        {values.map(({ row }) => {
          const stillOpen = outstanding.has(row.id);
          return (
            // The marker is a rule on the row, not a recoloured input border: a red field would
            // read as "you got this wrong", and nobody did -- the screenshot was just unreadable
            // there. It clears the moment a value is typed.
            <View key={row.id} style={[styles.field, stillOpen ? styles.fieldOpen : null]}>
              <Input
                label={`${itemLabel(row)}${row.item_type === "total" ? " (daily average)" : ""}`}
                value={drafts[row.id] ?? ""}
                onChangeText={(t) => setDrafts((prev) => ({ ...prev, [row.id]: t }))}
                keyboardType="number-pad"
                placeholder="minutes"
                editable={!busy}
              />
              {stillOpen && row.needs_input ? (
                // The no-guessing rule, in the user's language. Empty because nobody could read
                // it — not because something went wrong.
                <Text style={textStyle("caption", color.accent)}>
                  Couldn&apos;t read this one — type what the screenshot says.
                </Text>
              ) : row.source_snippet != null ? (
                <Text style={textStyle("caption", color.inkFaint)}>Read as “{row.source_snippet}”</Text>
              ) : null}
            </View>
          );
        })}

        {error != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

        <Button onPress={() => void onConfirm()} disabled={busy || outstanding.size > 0}>
          Confirm the week
        </Button>
        {/* Points at the fields rather than refusing with a message. */}
        {outstanding.size > 0 ? (
          <Text style={textStyle("caption", color.inkFaint)}>
            Still to fill in: {outstandingLabels.join(", ")}
          </Text>
        ) : null}
      </View>
    </Panel>
  );
}

/**
 * The weekly series, gaps and all.
 *
 * An unreported week is an outlined empty slot labelled "not reported" — never a zero-height bar,
 * never a line drawn across it. The app does not know what happened that week and must not draw a
 * claim that it does. Nothing here counts weeks in a row.
 */
function WeeklySeries({ points, summary }: { points: WeekPoint[]; summary: SeriesSummary }) {
  if (summary.reportedWeeks === 0) {
    return (
      <EmptyState
        title="No weeks reported yet"
        description="Confirm one screenshot and the series starts. It reads alongside your Hours — a second measure of where the week actually went."
      />
    );
  }

  const peak = Math.max(...points.map((p) => p.minutes ?? 0), 1);

  return (
    <Panel>
      <View style={styles.block}>
        <View style={styles.seriesHeader}>
          <Text style={textStyle("label", color.inkMuted)}>WEEKLY DAILY AVERAGE</Text>
          {/* The average is over REPORTED weeks only, so it is quoted with its own denominator.
              Deliberately not "4 of 12": a coverage score is one step from a consistency verdict. */}
          {summary.averageMinutes != null ? (
            <Text style={textStyle("label", color.inkFaint)}>
              {formatMinutes(summary.averageMinutes)} avg over {summary.reportedWeeks} reported{" "}
              {summary.reportedWeeks === 1 ? "week" : "weeks"}
            </Text>
          ) : null}
        </View>

        <View style={styles.chart} accessibilityRole="image" accessibilityLabel="Weekly screen time, oldest first">
          {points.map((point) => (
            <View
              key={point.weekStartDate}
              style={styles.slot}
              accessibilityLabel={
                point.minutes != null
                  ? `Week of ${point.weekStartDate}, ${formatMinutes(point.minutes)} a day`
                  : `Week of ${point.weekStartDate}, not reported`
              }
            >
              {point.minutes != null ? (
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(4, Math.round((point.minutes / peak) * 100))}%` },
                  ]}
                />
              ) : (
                // The hole.
                <View style={styles.hole} />
              )}
            </View>
          ))}
        </View>

        {/* The legend, and nothing beyond it. Saying "not a streak" would still be saying
            something about streaks, which D51 rules out along with the streak itself. */}
        <Text style={textStyle("caption", color.inkFaint)}>
          An outlined week is one you didn&apos;t report.
        </Text>

        {summary.deltaMinutes != null ? (
          <Text style={textStyle("caption", color.inkFaint)}>
            {summary.deltaMinutes === 0
              ? "Level with the previous reported week."
              : `${summary.deltaMinutes > 0 ? "+" : "−"}${formatMinutes(Math.abs(summary.deltaMinutes))} a day against the previous reported week.`}
          </Text>
        ) : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
  block: { gap: space[3] },
  field: { gap: space[1] },
  fieldOpen: { borderLeftWidth: 2, borderLeftColor: color.accent, paddingLeft: space[3] },
  seriesHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[3], flexWrap: "wrap" },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: space[1], height: 96 },
  slot: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: radius.sm, backgroundColor: color.accent },
  hole: {
    height: "100%",
    width: "100%",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.hairline,
  },
});
