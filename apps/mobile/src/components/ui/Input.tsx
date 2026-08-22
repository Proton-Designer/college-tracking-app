import { color, glass, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";
import { GlassSurface } from "./GlassSurface";
import { Label } from "./Label";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string | undefined;
  required?: boolean;
}

/** §2's `sunken` tier is the well/inset-row material -- a text field is exactly that, so
 *  unlike Panel/Modal it deliberately gets no `shadow.*`: a recessed surface that also floats
 *  would contradict itself. `GlassSurface` is what keeps the TextInput from painting behind
 *  its own blur/tint on web -- see that component's comment and FOLLOWUPS G1. */
export function Input({ label, error, required, editable = true, ...rest }: InputProps) {
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
          style={[styles.input, textStyle("body", disabled ? color.inkFaint : color.ink)]}
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
    height: 44,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  input: {
    height: 44,
    paddingHorizontal: space[3],
    backgroundColor: "transparent",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
