"use client";

import type { Profile } from "@collegeos/api";
import { useState, useTransition } from "react";
import { updateProfileAction } from "@/app/(app)/settings/actions";
import { Button, FieldError, Input, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

/** Timezone is first and deliberately prominent -- SCREEN_SPEC §9: every local_date in
 *  this product, every "day" boundary, every nightly job schedule derives from it. A
 *  user who moves and doesn't update it gets subtly wrong days forever with nothing
 *  else in the UI to explain why. */
export function ProfileSection({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [timezone, setTimezone] = useState(profile.timezone);
  const [sleepBaselineHours, setSleepBaselineHours] = useState(profile.sleep_baseline_hours != null ? String(profile.sleep_baseline_hours) : "");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const dirty = timezone !== profile.timezone || sleepBaselineHours !== (profile.sleep_baseline_hours != null ? String(profile.sleep_baseline_hours) : "");

  function handleSave() {
    setError(undefined);
    if (timezone.trim().length === 0) {
      setError("Timezone can't be blank.");
      return;
    }
    const parsedSleep = sleepBaselineHours.trim().length === 0 ? null : Number(sleepBaselineHours);
    if (parsedSleep != null && (Number.isNaN(parsedSleep) || parsedSleep < 0 || parsedSleep > 24)) {
      setError("Sleep baseline must be a number between 0 and 24.");
      return;
    }
    startTransition(async () => {
      const result = await updateProfileAction({ timezone: timezone.trim(), sleepBaselineHours: parsedSleep });
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't save — try again.", "error");
        return;
      }
      toast.show("Profile saved.");
    });
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Input
          label="Timezone"
          required
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/New_York"
        />
        <p className="text-caption text-ink-faint">
          An IANA timezone name. Every day boundary in Ihsan — when Today rolls over, when the nightly report runs — is
          computed from this. If it&apos;s wrong, your days will be wrong until you fix it.
        </p>
      </div>

      <Input
        label="Sleep baseline (hours)"
        value={sleepBaselineHours}
        onChange={(e) => setSleepBaselineHours(e.target.value)}
        placeholder="e.g. 7.5"
        inputMode="decimal"
      />

      {error ? <FieldError>{error}</FieldError> : null}

      <div>
        <Button onClick={handleSave} loading={isPending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </Panel>
  );
}
