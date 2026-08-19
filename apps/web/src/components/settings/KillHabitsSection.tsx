"use client";

import type { CommitmentLevel, KillHabitRow } from "@collegeos/api";
import { useState, useTransition } from "react";
import {
  createKillHabitAction,
  deactivateKillHabitAction,
  setMaxEscalationLevelAction,
  updateKillHabitAction,
} from "@/app/(app)/settings/actions";
import { Button, Input, Panel, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

/** LLM_LAYER_SPEC-adjacent honesty rule, same one applied to the nightly report:
 *  describe what a level actually does today, never what it's meant to eventually do.
 *  L2-L4 all currently produce the same thing L0/L1 do -- an in-app intervention message
 *  -- just with escalating framing. No app-blocking, no real outbound notification to a
 *  named contact (kill_habits has no contact field to notify), no consequence execution.
 *  Lead ruling, 2026-08-19: keep every level selectable (the decision logic is real and
 *  should be exercisable end to end), but label the unbuilt ones plainly. */
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

export function KillHabitsSection({ killHabits }: { killHabits: KillHabitRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      {killHabits
        .filter((h) => h.active)
        .map((habit) => (
          <KillHabitCard key={habit.id} habit={habit} />
        ))}
      <NewKillHabitCard />
    </div>
  );
}

function KillHabitCard({ habit }: { habit: KillHabitRow }) {
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
  const [isSaving, startSaving] = useTransition();
  const [isDeactivating, startDeactivating] = useTransition();
  const [isRaisingCeiling, startRaisingCeiling] = useTransition();

  function handleSaveChain() {
    startSaving(async () => {
      const result = await updateKillHabitAction(habit.id, {
        triggerDescription: fields.triggerDescription || null,
        urgeDescription: fields.urgeDescription || null,
        immediateReward: fields.immediateReward || null,
        longTermCost: fields.longTermCost || null,
        replacementBehavior: fields.replacementBehavior || null,
        implementationIntention: fields.implementationIntention || null,
      });
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't save — try again.", "error");
        return;
      }
      toast.show("Saved.");
    });
  }

  function handleDeactivate() {
    startDeactivating(async () => {
      const result = await deactivateKillHabitAction(habit.id);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't deactivate — try again.", "error");
        return;
      }
      toast.show(`"${habit.name}" deactivated.`);
    });
  }

  function handleSetCeiling(level: CommitmentLevel) {
    startRaisingCeiling(async () => {
      const result = await setMaxEscalationLevelAction(habit.id, level);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't update — try again.", "error");
        return;
      }
      toast.show(`Escalation ceiling for "${habit.name}" set to ${LEVEL_LABEL[level]}.`);
    });
  }

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-body font-medium text-ink">{habit.name}</span>
          <span className="text-caption text-ink-faint">Currently at {LEVEL_LABEL[habit.escalation_level]}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Collapse" : "Edit"}
          </Button>
          <Button variant="ghost" onClick={handleDeactivate} loading={isDeactivating}>
            Deactivate
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <Textarea
            label="Trigger — what sets this off"
            value={fields.triggerDescription}
            onChange={(e) => setFields((f) => ({ ...f, triggerDescription: e.target.value }))}
            rows={2}
          />
          <Textarea
            label="Urge — what it feels like"
            value={fields.urgeDescription}
            onChange={(e) => setFields((f) => ({ ...f, urgeDescription: e.target.value }))}
            rows={2}
          />
          <Textarea
            label="Immediate reward"
            value={fields.immediateReward}
            onChange={(e) => setFields((f) => ({ ...f, immediateReward: e.target.value }))}
            rows={2}
          />
          <Textarea
            label="Long-term cost"
            value={fields.longTermCost}
            onChange={(e) => setFields((f) => ({ ...f, longTermCost: e.target.value }))}
            rows={2}
          />
          <Textarea
            label="Replacement behavior"
            value={fields.replacementBehavior}
            onChange={(e) => setFields((f) => ({ ...f, replacementBehavior: e.target.value }))}
            rows={2}
          />
          <Textarea
            label="Implementation intention (if-then)"
            value={fields.implementationIntention}
            onChange={(e) => setFields((f) => ({ ...f, implementationIntention: e.target.value }))}
            rows={2}
            placeholder="If [trigger], then I will [replacement behavior]."
          />
          <div>
            <Button onClick={handleSaveChain} loading={isSaving}>
              Save
            </Button>
          </div>

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <p className="text-body-s font-medium text-ink">Escalation ceiling</p>
            <p className="text-caption text-ink-faint">
              How far this habit is allowed to escalate after repeated relapses. Escalation is earned by evidence, never a
              switch flipped on a bad day — this only sets the ceiling; whether it actually rises is decided automatically
              from relapse history.
            </p>
            <div className="flex flex-col gap-2">
              {ALL_LEVELS.map((level) => (
                <label key={level} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`ceiling-${habit.id}`}
                    checked={habit.max_escalation_level === level}
                    disabled={isRaisingCeiling}
                    onChange={() => handleSetCeiling(level)}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <span className="text-body-s text-ink">{LEVEL_LABEL[level]}</span>
                    <span className="text-caption text-ink-faint">{LEVEL_DESCRIPTION[level]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function NewKillHabitCard() {
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(undefined);
    if (name.trim().length === 0) {
      setError("Name the behavior you're trying to kill.");
      return;
    }
    startTransition(async () => {
      const result = await createKillHabitAction({ name: name.trim() });
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't create — try again.", "error");
        return;
      }
      setName("");
      toast.show("Kill habit created — expand it below to fill in the rest of the chain.");
    });
  }

  return (
    <Panel className="flex flex-col gap-2">
      <p className="text-body-s font-medium text-ink">New kill habit</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Doomscrolling before bed" error={error} />
        </div>
        <Button onClick={handleCreate} loading={isPending}>
          Add
        </Button>
      </div>
    </Panel>
  );
}
