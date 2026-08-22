import type { InterventionRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  dismissInterventionAction,
  markInterventionsDeliveredAction,
  respondToInterventionAction,
} from "../../lib/interventionActions";
import { textStyle } from "../../design/typography";
import { Button, Panel } from "../ui";

/**
 * U1 — the interventions surface. Ported from web; **behaviour and information are
 * identical by requirement**, only the idiom differs.
 *
 * "Intervene" is a step of the product's core loop and until now it had no surface at all
 * — and worse, nothing ever ran the evaluators, so no intervention was ever created in the
 * real request path. The loop was open at this step from the beginning.
 *
 * `actions` comes from the intervention row, never a list hardcoded here, so the buttons
 * can't drift from what the engine decided or from what the server will accept.
 */

const KIND_LABEL: Record<string, string> = {
  exception_notification: "Heads up",
  deviation_prompt: "Off plan",
  escalation_action: "Kill list",
  stale_task_prompt: "Still real?",
};

function InterventionCard({
  intervention,
  userId,
  onChanged,
}: {
  intervention: InterventionRow;
  userId: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(action: string) {
    setError(null);
    setBusy(true);
    const result = await respondToInterventionAction({ userId, interventionId: intervention.id, action });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't record that — try again.");
      return;
    }
    onChanged();
  }

  async function dismiss() {
    setError(null);
    setBusy(true);
    const result = await dismissInterventionAction({ interventionId: intervention.id });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't dismiss that — try again.");
      return;
    }
    onChanged();
  }

  return (
    <Panel style={styles.panel}>
      <Text style={textStyle("label", color.riskModerate)}>{KIND_LABEL[intervention.kind] ?? intervention.kind}</Text>
      <Text style={textStyle("body", color.ink)}>{intervention.message}</Text>

      {/* Why it fired, stated plainly. An intervention that won't show its working is
          asking for trust it hasn't earned. */}
      <Text style={textStyle("caption", color.inkFaint)}>{intervention.trigger_reason}</Text>

      <View style={styles.actions}>
        {intervention.actions.map((action) => (
          <Button key={action} variant="secondary" onPress={() => respond(action)} disabled={busy}>
            {action}
          </Button>
        ))}
        <Button variant="ghost" onPress={dismiss} disabled={busy}>
          Not now
        </Button>
      </View>

      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
    </Panel>
  );
}

export function InterventionsSection({
  interventions,
  userId,
  onChanged,
}: {
  interventions: InterventionRow[];
  userId: string;
  onChanged: () => void;
}) {
  const undelivered = interventions.filter((i) => i.status === "pending").map((i) => i.id);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || undelivered.length === 0) return;
    marked.current = true;
    void markInterventionsDeliveredAction({ interventionIds: undelivered });
  }, [undelivered]);

  if (interventions.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={textStyle("label", color.inkMuted)}>Needs a decision</Text>
      {interventions.map((intervention) => (
        <InterventionCard key={intervention.id} intervention={intervention} userId={userId} onChanged={onChanged} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
  },
  panel: {
    gap: space[2],
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    alignItems: "center",
  },
});
