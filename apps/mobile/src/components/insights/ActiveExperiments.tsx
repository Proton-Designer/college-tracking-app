import { daysBetween, MIN_EXPERIMENT_MEASUREMENTS } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ActiveExperiment } from "../../lib/useInsightsData";
import { closeExperiment, logMeasurement } from "../../lib/insightsActions";
import { textStyle } from "../../design/typography";
import { Button, Input, Panel, Select, Textarea } from "../ui";

/**
 * Ported from web's ActiveExperiments. **Behaviour and information are identical by
 * requirement** (SCREEN_SPEC: layout and idiom may diverge across platforms, behaviour and
 * information may not) -- same window phrasing, same verdict text, same reasons given when
 * there is no verdict, same duplicate-reading guard.
 *
 * U9: this surface used to be read-only, which was the bug. `createExperiment` had a
 * caller; `logExperimentMeasurement`, `scoreExperiment` and `getExperimentOutcome` had
 * none on either platform, so a trial could be started and then never measured or closed --
 * the Learn step of the closed loop dead-ended.
 */

/** `elapsed` counts days *since* the start date, so it is 0 on the day a trial begins;
 *  humans call that day one, hence `elapsed + 1`. It can legitimately exceed the planned
 *  window -- that means "overdue for scoring", a real state to name rather than a bad
 *  number to hide. Rendering it unclamped as "Day 8 of 7" was U9's visible symptom. */
function describeWindow(elapsed: number, total: number | null): { line: string; readyToScore: boolean } {
  if (total == null) return { line: `Day ${elapsed + 1} · no end date set`, readyToScore: false };
  if (elapsed >= total) return { line: `Window complete — ran ${total} days`, readyToScore: true };
  return { line: `Day ${elapsed + 1} of ${total}`, readyToScore: false };
}

function VerdictLine({ item }: { item: ActiveExperiment }) {
  const { experiment, measurements, outcome } = item;

  // Every branch says WHY there is no verdict. A missing verdict rendered as a neutral or
  // zero result would be a fabricated finding.
  if (outcome) {
    const moved = outcome.movedInHypothesizedDirection ? "moved as predicted" : "moved against the prediction";
    const sign = outcome.percentChange > 0 ? "+" : "";
    return (
      <Text style={textStyle("bodyS", color.inkMuted)}>
        {outcome.trialMeanValue.toFixed(1)} vs baseline {outcome.baselineValue.toFixed(1)} ({sign}
        {outcome.percentChange.toFixed(0)}%) — {moved}, confidence {outcome.confidence}.
      </Text>
    );
  }

  if (experiment.metric_name == null || experiment.baseline_value == null || experiment.hypothesized_direction == null) {
    return (
      <Text style={textStyle("bodyS", color.riskHigh)}>
        This trial never recorded what it measures, what it started from, or which way it should move — so it
        can&apos;t be scored. Close it and start a new one with those set.
      </Text>
    );
  }

  const scored = measurements.filter((m) => m.metric === experiment.metric_name);
  return (
    <Text style={textStyle("caption", color.inkFaint)}>
      {scored.length} of {MIN_EXPERIMENT_MEASUREMENTS} readings needed before a verdict is meaningful.
    </Text>
  );
}

function ExperimentCard({
  item,
  today,
  userId,
  onChanged,
}: {
  item: ActiveExperiment;
  today: string;
  userId: string;
  onChanged: () => void;
}) {
  const { experiment, measurements } = item;
  const elapsed = daysBetween(experiment.start_date, today);
  const total = experiment.end_date ? daysBetween(experiment.start_date, experiment.end_date) : null;
  const { line, readyToScore } = describeWindow(elapsed, total);

  const [mode, setMode] = useState<"idle" | "log" | "close">("idle");
  const [reading, setReading] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<"completed" | "abandoned">("completed");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const metric = experiment.metric_name;
  const readingsForMetric = metric ? measurements.filter((m) => m.metric === metric).length : measurements.length;
  const loggedToday = measurements.some((m) => m.local_date === today && (!metric || m.metric === metric));

  async function handleLog() {
    const value = Number(reading);
    if (reading.trim() === "" || !Number.isFinite(value)) {
      setError("Enter today's reading as a number.");
      return;
    }
    if (!metric) {
      setError("This trial has no declared measure, so a reading has nothing to attach to.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await logMeasurement({ userId, experimentId: experiment.id, metric, value });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save that reading — try again.");
      return;
    }
    setReading("");
    setMode("idle");
    onChanged();
  }

  async function handleClose() {
    if (!summary.trim()) {
      setError("Say what happened — a closed trial with no finding teaches nothing.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await closeExperiment({ experimentId: experiment.id, status, outcomeSummary: summary.trim() });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't close that trial — try again.");
      return;
    }
    setMode("idle");
    onChanged();
  }

  return (
    <Panel style={styles.panel}>
      <Text style={textStyle("body", color.ink)}>{experiment.hypothesis}</Text>

      <Text style={textStyle("caption", color.inkFaint)}>
        {line}
        {metric
          ? ` · ${metric}${
              experiment.hypothesized_direction
                ? ` should go ${experiment.hypothesized_direction === "increase" ? "up" : "down"}`
                : ""
            }`
          : ""}
        {readingsForMetric === 0 ? " · no readings yet" : ` · ${readingsForMetric} readings`}
      </Text>

      {readyToScore ? <Text style={textStyle("label", color.riskModerate)}>Ready to score</Text> : null}

      <VerdictLine item={item} />

      {mode === "idle" ? (
        <View style={styles.row}>
          {metric ? (
            <Button variant="secondary" onPress={() => setMode("log")} disabled={loggedToday}>
              {loggedToday ? "Today's reading is in" : "Log today's reading"}
            </Button>
          ) : null}
          <Button variant={readyToScore ? "primary" : "ghost"} onPress={() => setMode("close")}>
            Score this trial
          </Button>
        </View>
      ) : null}

      {mode === "log" ? (
        <View style={styles.stack}>
          <Input label={metric ?? "Reading"} keyboardType="numeric" value={reading} onChangeText={setReading} />
          <View style={styles.row}>
            <Button variant="primary" loading={busy} onPress={handleLog}>
              Save reading
            </Button>
            <Button variant="ghost" onPress={() => setMode("idle")} disabled={busy}>
              Cancel
            </Button>
          </View>
        </View>
      ) : null}

      {mode === "close" ? (
        <View style={styles.stack}>
          <Select
            label="Outcome"
            value={status}
            onValueChange={(v) => setStatus(v === "abandoned" ? "abandoned" : "completed")}
            options={[
              { value: "completed", label: "Ran to completion" },
              { value: "abandoned", label: "Abandoned" },
            ]}
          />
          <Textarea
            label="What did you actually learn?"
            value={summary}
            onChangeText={setSummary}
            rows={2}
            placeholder="The verdict above is the arithmetic. This is what it means."
          />
          <View style={styles.row}>
            <Button variant="primary" loading={busy} onPress={handleClose}>
              Close trial
            </Button>
            <Button variant="ghost" onPress={() => setMode("idle")} disabled={busy}>
              Cancel
            </Button>
          </View>
        </View>
      ) : null}

      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
    </Panel>
  );
}

export function ActiveExperiments({
  experiments,
  today,
  userId,
  onChanged,
}: {
  experiments: ActiveExperiment[];
  today: string;
  userId: string;
  onChanged: () => void;
}) {
  if (experiments.length === 0) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>No experiments running right now.</Text>;
  }

  return (
    <View style={styles.list}>
      {experiments.map((item) => (
        <ExperimentCard key={item.experiment.id} item={item} today={today} userId={userId} onChanged={onChanged} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[3],
  },
  panel: {
    gap: space[2],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    alignItems: "center",
  },
  stack: {
    gap: space[2],
  },
});
