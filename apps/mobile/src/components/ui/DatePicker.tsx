import { color, glass, radius, space } from "@collegeos/design/native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { Button } from "./Button";
import { FieldError } from "./FieldError";
import { GlassSurface } from "./GlassSurface";
import { Label } from "./Label";
import { Modal } from "./Modal";

export interface DatePickerProps {
  label?: string;
  /** Local calendar date, "YYYY-MM-DD" -- never a timezone-derived instant (§ local days). */
  value: string | null;
  onValueChange: (value: string | null) => void;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
}

function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, d as number);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(value: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

/** The native OS picker -- a spinner on iOS, a calendar dialog on Android. "Unset" can't be
 *  delegated to it (the control always shows *some* date), so the trigger below reads
 *  "Set a date" until a value actually exists, and a separate Clear affordance is the only
 *  way back to null -- the picker itself never re-produces the unset state on its own. */
export function DatePicker({ label, value, onValueChange, minDate, maxDate, disabled = false, error, required }: DatePickerProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const current = value ? parseLocalDate(value) : new Date();

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === "set" && date) onValueChange(formatLocalDate(date));
  }

  function open() {
    if (disabled) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onChange: handleChange,
        ...(minDate ? { minimumDate: parseLocalDate(minDate) } : null),
        ...(maxDate ? { maximumDate: parseLocalDate(maxDate) } : null),
      });
    } else {
      setIosOpen(true);
    }
  }

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
      <View style={styles.row}>
        <GlassSurface
          tier="sunken"
          style={[
            styles.clip,
            { borderColor: error ? color.riskCritical : glass.edgeHairline, opacity: disabled ? 0.6 : 1 },
            focused && !disabled ? styles.focusRing : null,
          ]}
          // See Select.tsx's identical comment -- the trigger below is `flex: 1` and needs
          // real space from the content wrapper to grow into, or it collapses to zero (both
          // invisibly and to touch). Confirmed live on device.
          contentStyle={styles.content}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label ? `${label}, ${value ? formatDisplay(value) : "Set a date"}` : undefined}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={open}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={textStyle("body", value ? color.ink : color.inkFaint)}>
              {value ? formatDisplay(value) : "Set a date"}
            </Text>
          </Pressable>
        </GlassSurface>
        {value && !disabled ? (
          <Pressable
            onPress={() => onValueChange(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={label ? `Clear ${label}` : "Clear"}
          >
            <Text style={textStyle("caption", color.inkFaint)}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <FieldError>{error}</FieldError> : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={iosOpen}
          onClose={() => setIosOpen(false)}
          title={label ?? "Set a date"}
          footer={
            <Button variant="primary" onPress={() => setIosOpen(false)}>
              Done
            </Button>
          }
        >
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            onChange={handleChange}
            {...(minDate ? { minimumDate: parseLocalDate(minDate) } : null)}
            {...(maxDate ? { maximumDate: parseLocalDate(maxDate) } : null)}
          />
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  clip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
  },
  content: {
    flexGrow: 1,
  },
  trigger: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space[3],
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
