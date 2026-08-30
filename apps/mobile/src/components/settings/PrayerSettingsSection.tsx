import type { Profile } from "@collegeos/api";
import { CALC_METHOD_LABELS, type AsrMadhab, type CalcMethod } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { updatePrayerSettingsAction } from "../../lib/settingsActions";
import { Button, Input, Panel, Select } from "../ui";
import { useToast } from "../ui/ToastProvider";

/**
 * Mirrors apps/web/src/components/settings/PrayerSettingsSection.tsx one-for-one — same
 * fields, same validation, same copy. D39: per-user data, never a constant.
 *
 * No geocoding: the label is a name a person recognises, the two numbers are what
 * `packages/core` computes from, and nothing is looked up or sent anywhere to resolve a place.
 * The unset state is the default for all three users and is written to be read first, not as
 * a degraded version of a filled-in form (D40).
 */

const CALC_METHOD_OPTIONS = (Object.keys(CALC_METHOD_LABELS) as CalcMethod[]).map((value) => ({
  value,
  label: CALC_METHOD_LABELS[value],
}));

const ASR_OPTIONS: { value: AsrMadhab; label: string }[] = [
  { value: "standard", label: "Standard (Shafi'i, Maliki, Hanbali)" },
  { value: "hanafi", label: "Hanafi" },
];

function numberFieldValue(value: number | null): string {
  return value == null ? "" : String(value);
}

export function PrayerSettingsSection({ userId, profile }: { userId: string; profile: Profile }) {
  const toast = useToast();
  const [label, setLabel] = useState(profile.location_label ?? "");
  const [lat, setLat] = useState(numberFieldValue(profile.location_lat));
  const [lng, setLng] = useState(numberFieldValue(profile.location_lng));
  const [calcMethod, setCalcMethod] = useState<CalcMethod>(profile.prayer_calc_method as CalcMethod);
  const [asrMadhab, setAsrMadhab] = useState<AsrMadhab>(profile.asr_madhab as AsrMadhab);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const locationSet = profile.location_lat != null && profile.location_lng != null;
  const dirty =
    label !== (profile.location_label ?? "") ||
    lat !== numberFieldValue(profile.location_lat) ||
    lng !== numberFieldValue(profile.location_lng) ||
    calcMethod !== profile.prayer_calc_method ||
    asrMadhab !== profile.asr_madhab;

  async function handleSave() {
    setError(undefined);
    const latTrimmed = lat.trim();
    const lngTrimmed = lng.trim();
    // Mirrors the DB's profiles_location_pair constraint with the friendlier message. A
    // half-set location would surface as a WRONG prayer time rather than a missing one.
    if ((latTrimmed === "") !== (lngTrimmed === "")) {
      setError("Latitude and longitude go together — set both, or leave both blank.");
      return;
    }
    const parsedLat = latTrimmed === "" ? null : Number(latTrimmed);
    const parsedLng = lngTrimmed === "" ? null : Number(lngTrimmed);
    if (parsedLat != null && (Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90)) {
      setError("Latitude has to be a number between -90 and 90.");
      return;
    }
    if (parsedLng != null && (Number.isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180)) {
      setError("Longitude has to be a number between -180 and 180.");
      return;
    }

    setSaving(true);
    const result = await updatePrayerSettingsAction(userId, {
      locationLabel: label.trim().length > 0 ? label.trim() : null,
      lat: parsedLat,
      lng: parsedLng,
      calcMethod,
      asrMadhab,
    });
    setSaving(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't save — try again.", "error");
      return;
    }
    toast.show(parsedLat == null ? "Location cleared." : "Prayer settings saved.");
  }

  return (
    <Panel style={{ gap: space[4] }}>
      {locationSet ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Prayer times are computed for {profile.location_label ?? "your saved coordinates"}. Clear both coordinates
          to switch them off again.
        </Text>
      ) : (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          No location set. Deen shows your prayers as awaiting a time rather than guessing one — nothing on that page
          is a computed time, a rate, or a miss until these two numbers exist.
        </Text>
      )}

      <Input label="Place" value={label} onChangeText={setLabel} placeholder="e.g. Home — Ottawa" />

      <Input label="Latitude" value={lat} onChangeText={setLat} placeholder="45.4215" keyboardType="numbers-and-punctuation" />
      <Input label="Longitude" value={lng} onChangeText={setLng} placeholder="-75.6972" keyboardType="numbers-and-punctuation" />
      <Text style={textStyle("caption", color.inkFaint)}>
        Decimal degrees — north and east positive, south and west negative. Read them off any map app; nothing here
        looks a place up for you, and nothing is sent anywhere to resolve it.
      </Text>

      <Select
        label="Calculation method"
        options={CALC_METHOD_OPTIONS}
        value={calcMethod}
        onValueChange={(value) => setCalcMethod(value as CalcMethod)}
      />
      <Select
        label="Asr"
        options={ASR_OPTIONS}
        value={asrMadhab}
        onValueChange={(value) => setAsrMadhab(value as AsrMadhab)}
      />
      <Text style={textStyle("caption", color.inkFaint)}>
        Both only take effect once a location exists — they change the sun angles Fajr, Isha and Asr are derived from,
        and there is nothing to derive without coordinates.
      </Text>

      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

      <View>
        <Button onPress={handleSave} loading={saving} disabled={!dirty}>
          Save
        </Button>
      </View>
    </Panel>
  );
}
