import { color, glass, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";
import { GlassSurface } from "./GlassSurface";
import { Label } from "./Label";
import { Modal } from "./Modal";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  /** Shown while value is null. Never a default selection -- unset stays unset. */
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
}

/** A trigger that opens a picker sheet (built on the shared Modal) -- there's no native
 *  <select> equivalent on RN, and this keeps the same list-of-options mental model as
 *  ChipGroup/SegmentedControl rather than a platform-specific wheel. The trigger is
 *  `glass-sunken`, the same well material as Input. */
export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled = false,
  error,
  required,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
      <GlassSurface
        tier="sunken"
        style={[
          styles.clip,
          {
            borderColor: error ? color.riskCritical : glass.edgeHairline,
            opacity: disabled ? 0.6 : 1,
          },
          focused && !disabled ? styles.focusRing : null,
        ]}
        // GlassSurface's content wrapper has no size of its own by default -- without this,
        // the trigger below (styled `flex: 1`) has no real space to grow into and collapses
        // toward zero, both invisibly (its placeholder/chevron Text never paints) and to touch
        // (nothing there to tap). Confirmed live on device; see GlassSurface's own doc comment
        // for why this is a per-caller fix and not a GlassSurface default.
        contentStyle={styles.content}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ? `${label}, ${selected ? selected.label : placeholder}` : (selected ? selected.label : placeholder)}
          accessibilityState={{ disabled, expanded: open }}
          disabled={disabled}
          onPress={() => setOpen(true)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={textStyle("body", selected ? color.ink : color.inkFaint)} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          <Text style={textStyle("bodyS", color.inkFaint)}>▾</Text>
        </Pressable>
      </GlassSurface>
      {error ? <FieldError>{error}</FieldError> : null}

      <Modal visible={open} onClose={() => setOpen(false)} title={label ?? "Select"}>
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, { backgroundColor: pressed ? color.surfaceSunken : "transparent" }]}
              >
                <Text style={textStyle("body", isSelected ? color.accent : color.ink)}>{option.label}</Text>
                {isSelected ? (
                  <Text accessibilityElementsHidden importantForAccessibility="no" style={textStyle("body", color.accent)}>
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  clip: {
    height: 44,
    borderRadius: radius.md,
  },
  content: {
    flexGrow: 1,
  },
  trigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[3],
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
  list: {
    gap: space[1],
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
  },
});
