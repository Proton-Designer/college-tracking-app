import type { LlmMonthlySpend, Profile } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { updateLlmBudgetAction } from "../../lib/settingsActions";
import { Button, Input, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";

export function LlmBudgetSection({
  userId,
  profile,
  monthlySpend,
  hasEverCalledModel,
}: {
  userId: string;
  profile: Profile;
  monthlySpend: LlmMonthlySpend;
  hasEverCalledModel: boolean;
}) {
  const toast = useToast();
  const [budget, setBudget] = useState(String(profile.llm_monthly_budget_usd));
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(undefined);
    const parsed = Number(budget);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("Monthly budget must be a positive number.");
      return;
    }
    setSaving(true);
    const result = await updateLlmBudgetAction(userId, parsed);
    setSaving(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't save — try again.", "error");
      return;
    }
    toast.show("Budget saved.");
  }

  return (
    <Panel style={{ gap: space[4] }}>
      <View style={{ gap: space[2] }}>
        {hasEverCalledModel ? (
          <Text style={textStyle("body", color.ink)}>
            ${monthlySpend.spentUsd.toFixed(2)} spent this month, of ${Number(profile.llm_monthly_budget_usd).toFixed(2)}.
          </Text>
        ) : (
          <Text style={textStyle("body", color.ink)}>
            No model calls have been made yet. Every report so far has used the deterministic-only path — this isn&apos;t a
            $0.00 measurement of a working budget, it&apos;s an honest statement that the model layer hasn&apos;t run.
          </Text>
        )}
        <Text style={textStyle("caption", color.inkFaint)}>
          The nightly report runs on deterministic engine output regardless — the model layer only adds interpretation on
          top, and degrades to the deterministic report whenever it&apos;s unavailable or the budget below would be exceeded.
        </Text>
      </View>

      <View style={{ gap: space[1] }}>
        <Input label="Monthly budget ceiling (USD)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" />
        {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
      </View>

      <Button onPress={handleSave} loading={saving} disabled={budget === String(profile.llm_monthly_budget_usd)}>
        Save
      </Button>
    </Panel>
  );
}
