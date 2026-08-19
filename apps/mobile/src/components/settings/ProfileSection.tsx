import type { Profile } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { updateProfileAction } from "../../lib/settingsActions";
import { Button, Input, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";

/** Timezone is first and deliberately prominent -- SCREEN_SPEC §9: every local_date in
 *  this product, every "day" boundary, every nightly job schedule derives from it. */
export function ProfileSection({ userId, profile }: { userId: string; profile: Profile }) {
  const toast = useToast();
  const [timezone, setTimezone] = useState(profile.timezone);
  const [sleepBaselineHours, setSleepBaselineHours] = useState(profile.sleep_baseline_hours != null ? String(profile.sleep_baseline_hours) : "");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const dirty = timezone !== profile.timezone || sleepBaselineHours !== (profile.sleep_baseline_hours != null ? String(profile.sleep_baseline_hours) : "");

  async function handleSave() {
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
    setSaving(true);
    const result = await updateProfileAction(userId, { timezone: timezone.trim(), sleepBaselineHours: parsedSleep });
    setSaving(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't save — try again.", "error");
      return;
    }
    toast.show("Profile saved.");
  }

  return (
    <Panel style={{ gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Input label="Timezone" required value={timezone} onChangeText={setTimezone} placeholder="America/New_York" autoCapitalize="none" />
        <Text style={textStyle("caption", color.inkFaint)}>
          An IANA timezone name. Every day boundary in CollegeOS — when Today rolls over, when the nightly report runs — is
          computed from this. If it&apos;s wrong, your days will be wrong until you fix it.
        </Text>
      </View>

      <Input
        label="Sleep baseline (hours)"
        value={sleepBaselineHours}
        onChangeText={setSleepBaselineHours}
        placeholder="e.g. 7.5"
        keyboardType="decimal-pad"
      />

      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

      <Button onPress={handleSave} loading={saving} disabled={!dirty}>
        Save
      </Button>
    </Panel>
  );
}
