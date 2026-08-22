import { color, radius, space } from "@collegeos/design/native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { Button } from "./Button";
import { FieldError } from "./FieldError";
import { Label } from "./Label";
import { Modal } from "./Modal";

export interface TimePickerProps {
  label?: string;
  /** Local wall-clock time, "HH:MM" 24h -- no date, no timezone, same shape CheckinFlow's
   *  timebox field already used before this replaced its free-text input. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
}

function parseLocalTime(value: string): Date {
  const [h, m] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(h as number, m as number, 0, 0);
  return date;
}

function formatLocalTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDisplay(value: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(parseLocalTime(value));
}

/** Same "unset can't be delegated to the OS control" discipline as DatePicker -- the native
 *  picker always shows *some* time (usually now), so the trigger reads "Set a time" until a
 *  real value exists, and Clear is the only way back to null. */
export function TimePicker({ label, value, onValueChange, disabled = false, error, required }: TimePickerProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const current = value ? parseLocalTime(value) : new Date();

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === "set" && date) onValueChange(formatLocalTime(date));
  }

  function open() {
    if (disabled) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: current, mode: "time", is24Hour: false, onChange: handleChange });
    } else {
      setIosOpen(true);
    }
  }

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={open}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => [
            styles.trigger,
            { borderColor: error ? color.riskCritical : color.border, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 },
            focused && !disabled ? styles.focusRing : null,
          ]}
        >
          <Text style={textStyle("body", value ? color.ink : color.inkFaint)}>
            {value ? formatDisplay(value) : "Set a time"}
          </Text>
        </Pressable>
        {value && !disabled ? (
          <Pressable onPress={() => onValueChange(null)} hitSlop={8}>
            <Text style={textStyle("caption", color.inkFaint)}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <FieldError>{error}</FieldError> : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={iosOpen}
          onClose={() => setIosOpen(false)}
          title={label ?? "Set a time"}
          footer={
            <Button variant="primary" onPress={() => setIosOpen(false)}>
              Done
            </Button>
          }
        >
          <DateTimePicker value={current} mode="time" display="spinner" onChange={handleChange} />
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
  trigger: {
    flex: 1,
    height: 44,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
    backgroundColor: color.surfaceSunken,
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
