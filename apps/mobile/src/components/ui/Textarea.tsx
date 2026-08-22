import { color, glass, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";
import { GlassSurface } from "./GlassSurface";
import { Label } from "./Label";

export interface TextareaProps extends Omit<TextInputProps, "style" | "multiline"> {
  label?: string;
  error?: string;
  required?: boolean;
  rows?: number;
}

/**
 * This is the mobile half of the night review's voice input (FOLLOWUPS V1). It works by
 * doing nothing: the OS soft keyboard already provides a dictation key, so a plain
 * multiline TextInput *is* a voice field — with better accuracy than anything we could
 * wire up, and no dependency or custom dev build. Web needs an explicit control only
 * because browsers offer no equivalent inside a <textarea>.
 *
 * So do not set `keyboardType`, `textContentType`, `secureTextEntry` or
 * `contextMenuHidden` here without checking what it does to the dictation key — several
 * of those hide it, which would silently delete a brief-specified feature with no visible
 * sign that anything broke. Verified 2026-08-22: this component passes none of them.
 */
export function Textarea({ label, error, required, editable = true, rows = 4, ...rest }: TextareaProps) {
  const [focused, setFocused] = useState(false);
  const disabled = !editable;

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
      <GlassSurface
        tier="sunken"
        style={[
          styles.clip,
          {
            borderColor: error ? color.riskCritical : focused ? color.accent : glass.edgeHairline,
            opacity: disabled ? 0.6 : 1,
          },
          focused ? styles.focusRing : null,
        ]}
      >
        <TextInput
          multiline
          editable={editable}
          placeholderTextColor={color.inkFaint}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, textStyle("body", disabled ? color.inkFaint : color.ink), { minHeight: rows * 22 }]}
          {...rest}
        />
      </GlassSurface>
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  clip: {
    borderRadius: radius.md,
  },
  input: {
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: "transparent",
    textAlignVertical: "top",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
