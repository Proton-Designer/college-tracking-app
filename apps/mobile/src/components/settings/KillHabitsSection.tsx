import type { CommitmentLevel, KillHabitRow } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import {
  createKillHabitAction,
  deactivateKillHabitAction,
  setMaxEscalationLevelAction,
  updateKillHabitAction,
} from "../../lib/settingsActions";
import { Button, Input, Panel, Textarea } from "../ui";
import { useToast } from "../ui/ToastProvider";

/** Same honesty rule as web (Lead ruling, 2026-08-19): describe what a level actually
 *  does today, never what it's meant to eventually do. Mirrors
 *  apps/web/src/components/settings/KillHabitsSection.tsx exactly. */
const LEVEL_LABEL: Record<CommitmentLevel, string> = {
  l0_reminder: "L0 — Reminder",
  l1_stronger_notification: "L1 — Stronger notification",
  l2_distraction_block: "L2 — Distraction block",
  l3_accountability_partner: "L3 — Accountability partner",
  l4_consequence: "L4 — Consequence",
};

const LEVEL_DESCRIPTION: Record<CommitmentLevel, string> = {
  l0_reminder: "A gentle in-app reminder when this habit fires. The default for every habit.",
  l1_stronger_notification: "A more insistent in-app message after repeated relapses. Still just you and the app.",
  l2_distraction_block: "In-app message only — blocking distracting apps isn't built yet (it needs native Screen Time access this product doesn't have).",
  l3_accountability_partner: "In-app message only — notifying a real contact isn't built yet (there's nowhere to store one yet).",
  l4_consequence: "In-app message only — executing a predetermined consequence isn't built yet.",
};

const ALL_LEVELS: CommitmentLevel[] = ["l0_reminder", "l1_stronger_notification", "l2_distraction_block", "l3_accountability_partner", "l4_consequence"];

export function KillHabitsSection({ userId, killHabits }: { userId: string; killHabits: KillHabitRow[] }) {
  return (
    <View style={{ gap: space[4] }}>
      {killHabits
        .filter((h) => h.active)
        .map((habit) => (
          <KillHabitCard key={habit.id} userId={userId} habit={habit} />
        ))}
      <NewKillHabitCard userId={userId} />
    </View>
  );
}

function KillHabitCard({ userId, habit }: { userId: string; habit: KillHabitRow }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState({
    triggerDescription: habit.trigger_description ?? "",
    urgeDescription: habit.urge_description ?? "",
    immediateReward: habit.immediate_reward ?? "",
    longTermCost: habit.long_term_cost ?? "",
    replacementBehavior: habit.replacement_behavior ?? "",
    implementationIntention: habit.implementation_intention ?? "",
  });
  const [savingChain, setSavingChain] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [settingCeiling, setSettingCeiling] = useState(false);

  async function handleSaveChain() {
    setSavingChain(true);
    const result = await updateKillHabitAction(userId, habit.id, {
      triggerDescription: fields.triggerDescription || null,
      urgeDescription: fields.urgeDescription || null,
      immediateReward: fields.immediateReward || null,
      longTermCost: fields.longTermCost || null,
      replacementBehavior: fields.replacementBehavior || null,
      implementationIntention: fields.implementationIntention || null,
    });
    setSavingChain(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't save — try again.", "error");
      return;
    }
    toast.show("Saved.");
  }

  async function handleDeactivate() {
    setDeactivating(true);
    const result = await deactivateKillHabitAction(userId, habit.id);
    setDeactivating(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't deactivate — try again.", "error");
      return;
    }
    toast.show(`"${habit.name}" deactivated.`);
  }

  async function handleSetCeiling(level: CommitmentLevel) {
    setSettingCeiling(true);
    const result = await setMaxEscalationLevelAction(userId, habit.id, level);
    setSettingCeiling(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't update — try again.", "error");
      return;
    }
    toast.show(`Escalation ceiling for "${habit.name}" set to ${LEVEL_LABEL[level]}.`);
  }

  return (
    <Panel style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] }}>
        <View>
          <Text style={textStyle("body", color.ink)}>{habit.name}</Text>
          <Text style={textStyle("caption", color.inkFaint)}>Currently at {LEVEL_LABEL[habit.escalation_level]}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Button variant="ghost" onPress={() => setExpanded((e) => !e)}>
            {expanded ? "Collapse" : "Edit"}
          </Button>
          <Button variant="ghost" onPress={handleDeactivate} loading={deactivating}>
            Deactivate
          </Button>
        </View>
      </View>

      {expanded ? (
        <View style={{ gap: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline, paddingTop: space[3] }}>
          <Textarea label="Trigger — what sets this off" value={fields.triggerDescription} onChangeText={(t) => setFields((f) => ({ ...f, triggerDescription: t }))} rows={2} />
          <Textarea label="Urge — what it feels like" value={fields.urgeDescription} onChangeText={(t) => setFields((f) => ({ ...f, urgeDescription: t }))} rows={2} />
          <Textarea label="Immediate reward" value={fields.immediateReward} onChangeText={(t) => setFields((f) => ({ ...f, immediateReward: t }))} rows={2} />
          <Textarea label="Long-term cost" value={fields.longTermCost} onChangeText={(t) => setFields((f) => ({ ...f, longTermCost: t }))} rows={2} />
          <Textarea label="Replacement behavior" value={fields.replacementBehavior} onChangeText={(t) => setFields((f) => ({ ...f, replacementBehavior: t }))} rows={2} />
          <Textarea
            label="Implementation intention (if-then)"
            value={fields.implementationIntention}
            onChangeText={(t) => setFields((f) => ({ ...f, implementationIntention: t }))}
            rows={2}
            placeholder="If [trigger], then I will [replacement behavior]."
          />
          <Button onPress={handleSaveChain} loading={savingChain}>
            Save
          </Button>

          <View style={{ gap: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline, paddingTop: space[3] }}>
            <Text style={textStyle("bodyS", color.ink)}>Escalation ceiling</Text>
            <Text style={textStyle("caption", color.inkFaint)}>
              How far this habit is allowed to escalate after repeated relapses. Escalation is earned by evidence, never a
              switch flipped on a bad day — this only sets the ceiling; whether it actually rises is decided automatically
              from relapse history.
            </Text>
            <View style={{ gap: space[2] }}>
              {ALL_LEVELS.map((level) => (
                <LevelOption
                  key={level}
                  selected={habit.max_escalation_level === level}
                  disabled={settingCeiling}
                  onPress={() => handleSetCeiling(level)}
                  label={LEVEL_LABEL[level]}
                  description={LEVEL_DESCRIPTION[level]}
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </Panel>
  );
}

function LevelOption({
  selected,
  disabled,
  onPress,
  label,
  description,
}: {
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  label: string;
  description: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        { flexDirection: "row", gap: space[3], opacity: disabled ? 0.6 : pressed ? 0.7 : 1 },
        focused && !disabled ? styles.focusRing : null,
      ]}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: radius.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? color.accent : color.border,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        {selected ? <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.accent }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={textStyle("bodyS", color.ink)}>{label}</Text>
        <Text style={textStyle("caption", color.inkFaint)}>{description}</Text>
      </View>
    </Pressable>
  );
}

function NewKillHabitCard({ userId }: { userId: string }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    setError(undefined);
    if (name.trim().length === 0) {
      setError("Name the behavior you're trying to kill.");
      return;
    }
    setPending(true);
    const result = await createKillHabitAction(userId, { name: name.trim() });
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't create — try again.", "error");
      return;
    }
    setName("");
    toast.show("Kill habit created — expand it below to fill in the rest of the chain.");
  }

  return (
    <Panel style={{ gap: space[2] }}>
      <Text style={textStyle("bodyS", color.ink)}>New kill habit</Text>
      <Input value={name} onChangeText={setName} placeholder="e.g. Doomscrolling before bed" error={error} />
      <Button onPress={handleCreate} loading={pending}>
        Add
      </Button>
    </Panel>
  );
}

const styles = StyleSheet.create({
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
