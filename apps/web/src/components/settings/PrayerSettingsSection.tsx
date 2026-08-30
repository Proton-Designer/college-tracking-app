"use client";

import type { Profile } from "@collegeos/api";
import { CALC_METHOD_LABELS, type AsrMadhab, type CalcMethod } from "@collegeos/core";
import { useState, useTransition } from "react";
import { updatePrayerSettingsAction } from "@/app/(app)/settings/actions";
import { Button, FieldError, Input, Panel, Select } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * Location + prayer calculation. D39: these are per-user data on the profile, never a
 * constant — three people use this app and they do not share a city or a madhab.
 *
 * **There is no geocoding service here, deliberately.** A place-name lookup is a third-party
 * dependency, a key, and a failure mode, and the value it produces is a coordinate the user
 * can read off their phone's map in ten seconds. The label is a name for a person to
 * recognise; the two numbers are what `packages/core` actually computes from.
 *
 * **The unset state is the one that matters.** No location is the default for all three users
 * right now, so the empty form is not a degraded version of this panel — it is the first thing
 * every one of them sees. It says what is missing and what stays switched off until it is
 * supplied, and it does not pre-fill a plausible coordinate to look finished (D40).
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

export function PrayerSettingsSection({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [label, setLabel] = useState(profile.location_label ?? "");
  const [lat, setLat] = useState(numberFieldValue(profile.location_lat));
  const [lng, setLng] = useState(numberFieldValue(profile.location_lng));
  const [calcMethod, setCalcMethod] = useState<CalcMethod>(profile.prayer_calc_method as CalcMethod);
  const [asrMadhab, setAsrMadhab] = useState<AsrMadhab>(profile.asr_madhab as AsrMadhab);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const locationSet = profile.location_lat != null && profile.location_lng != null;
  const dirty =
    label !== (profile.location_label ?? "") ||
    lat !== numberFieldValue(profile.location_lat) ||
    lng !== numberFieldValue(profile.location_lng) ||
    calcMethod !== profile.prayer_calc_method ||
    asrMadhab !== profile.asr_madhab;

  function handleSave() {
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

    startTransition(async () => {
      const result = await updatePrayerSettingsAction({
        locationLabel: label.trim().length > 0 ? label.trim() : null,
        lat: parsedLat,
        lng: parsedLng,
        calcMethod,
        asrMadhab,
      });
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't save — try again.", "error");
        return;
      }
      toast.show(parsedLat == null ? "Location cleared." : "Prayer settings saved.");
    });
  }

  return (
    <Panel className="flex flex-col gap-4">
      {locationSet ? (
        <p className="text-body-s text-ink-muted">
          Prayer times are computed for{" "}
          <span className="text-ink">{profile.location_label ?? "your saved coordinates"}</span>. Clear both
          coordinates to switch them off again.
        </p>
      ) : (
        <p className="text-body-s text-ink-muted">
          No location set. Deen shows your prayers as awaiting a time rather than guessing one — nothing on that page
          is a computed time, a rate, or a miss until these two numbers exist.
        </p>
      )}

      <Input
        label="Place"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Home — Ottawa"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Latitude"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="45.4215"
          inputMode="decimal"
        />
        <Input
          label="Longitude"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="-75.6972"
          inputMode="decimal"
        />
      </div>
      <p className="text-caption text-ink-faint">
        Decimal degrees — north and east positive, south and west negative. Read them off any map app; nothing here
        looks a place up for you, and nothing is sent anywhere to resolve it.
      </p>

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
      <p className="text-caption text-ink-faint">
        Both only take effect once a location exists — they change the sun angles Fajr, Isha and Asr are derived from,
        and there is nothing to derive without coordinates.
      </p>

      {error ? <FieldError>{error}</FieldError> : null}

      <div>
        <Button onClick={handleSave} loading={isPending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </Panel>
  );
}
