import type { DecisionJournalRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { logDecisionAction, scoreDecisionAction } from "../../lib/insightsActions";
import { textStyle } from "../../design/typography";
import { Button, Input, Panel, Textarea } from "../ui";

/**
 * U7 — the decision journal. Ported from web's DecisionJournal; **behaviour and information
 * are identical by requirement**, only the idiom differs (numeric keyboard on the
 * confidence field, a refetch callback instead of revalidatePath).
 *
 * Built in L8 with log/score/list and no caller on either platform. The brief wants a
 * decision recorded with its reasoning and a prediction, then scored later, so systematic
 * decision errors surface over time. Sits beside experiments because both are
 * observe-then-score.
 */

function formatDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}

function ScoreForm({ decisionId, onDone }: { decisionId: number; onDone: () => void }) {
  const [actual, setActual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!actual.trim()) {
      setError("Say what actually happened.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await scoreDecisionAction({ decisionId, actualOutcome: actual.trim() });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save that — try again.");
      return;
    }
    onDone();
  }

  return (
    <View style={styles.stack}>
      <Textarea label="What actually happened?" value={actual} onChangeText={setActual} rows={2} />
      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
      <View style={styles.row}>
        <Button variant="primary" loading={busy} onPress={submit}>
          Score it
        </Button>
        <Button variant="ghost" onPress={onDone} disabled={busy}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

function DecisionRow({ row, onChanged }: { row: DecisionJournalRow; onChanged: () => void }) {
  const [scoring, setScoring] = useState(false);
  const scored = row.scored_at != null;

  return (
    <Panel style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={[textStyle("body", color.ink), styles.flex]}>{row.decision}</Text>
        <Text style={textStyle("caption", color.inkFaint)}>{formatDate(row.local_date)}</Text>
      </View>

      {row.rationale ? <Text style={textStyle("bodyS", color.inkMuted)}>{row.rationale}</Text> : null}

      {/* Shown only when they exist. Rendering "0%" for a decision logged without a
          prediction would invent a certainty the user never expressed. */}
      {row.predicted_outcome || row.prediction_pct != null ? (
        <Text style={textStyle("caption", color.inkFaint)}>
          Predicted
          {row.predicted_outcome ? `: ${row.predicted_outcome}` : ""}
          {row.prediction_pct != null ? ` · ${Math.round(Number(row.prediction_pct))}% confident` : ""}
        </Text>
      ) : null}

      {scored ? (
        <Text style={textStyle("bodyS", color.ink)}>
          <Text style={textStyle("caption", color.accent)}>OUTCOME </Text>
          {row.actual_outcome}
        </Text>
      ) : scoring ? (
        <ScoreForm
          decisionId={row.id}
          onDone={() => {
            setScoring(false);
            onChanged();
          }}
        />
      ) : (
        <View style={styles.row}>
          <Button variant="secondary" onPress={() => setScoring(true)}>
            Score this
          </Button>
        </View>
      )}
    </Panel>
  );
}

function LogForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [predictedOutcome, setPredictedOutcome] = useState("");
  const [confidence, setConfidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!decision.trim()) {
      setError("What did you decide?");
      return;
    }
    const pct = confidence.trim() === "" ? null : Number(confidence);
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setError("Confidence is a percentage between 0 and 100.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await logDecisionAction({
      userId,
      decision: decision.trim(),
      ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
      ...(predictedOutcome.trim() ? { predictedOutcome: predictedOutcome.trim() } : {}),
      ...(pct != null ? { predictionPct: pct } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't log that — try again.");
      return;
    }
    onDone();
  }

  return (
    <Panel style={styles.panel}>
      <Textarea
        label="The decision"
        value={decision}
        onChangeText={setDecision}
        rows={2}
        placeholder="Dropping the second lab section to protect CHEM 255 study time"
      />
      <Textarea
        label="Why (your reasoning at the time)"
        value={rationale}
        onChangeText={setRationale}
        rows={2}
        placeholder="Recorded now, before the outcome is known — that's the point."
      />
      <Input label="What you expect to happen" value={predictedOutcome} onChangeText={setPredictedOutcome} />
      <Input
        label="Confidence (%)"
        keyboardType="numeric"
        value={confidence}
        onChangeText={setConfidence}
        placeholder="optional"
      />
      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
      <View style={styles.row}>
        <Button variant="primary" loading={busy} onPress={submit}>
          Log decision
        </Button>
        <Button variant="ghost" onPress={onDone} disabled={busy}>
          Cancel
        </Button>
      </View>
    </Panel>
  );
}

export function DecisionJournal({
  decisions,
  userId,
  onChanged,
}: {
  decisions: DecisionJournalRow[];
  userId: string;
  onChanged: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const unscored = decisions.filter((d) => d.scored_at == null).length;

  return (
    <View style={styles.stack}>
      <Text style={textStyle("bodyS", color.inkMuted)}>
        {decisions.length === 0
          ? "Record a real decision with your reasoning and what you expect. Score it later, and systematic errors start to show."
          : `${unscored} still waiting on an outcome.`}
      </Text>

      {logging ? (
        <LogForm
          userId={userId}
          onDone={() => {
            setLogging(false);
            onChanged();
          }}
        />
      ) : (
        <View style={styles.row}>
          <Button variant="secondary" onPress={() => setLogging(true)}>
            Log a decision
          </Button>
        </View>
      )}

      {decisions.map((row) => (
        <DecisionRow key={row.id} row={row} onChanged={onChanged} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
});
