import { BlurView } from "expo-blur";
import { color, glass, glassEdge, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";
import { Label } from "./Label";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string | undefined;
  required?: boolean;
}

/** §2's `sunken` tier is the well/inset-row material -- a text field is exactly that, so
 *  unlike Panel/Modal it deliberately gets no `shadow.*`: a recessed surface that also floats
 *  would contradict itself. Android renders `glass.sunken.fill` as a solid fill here, never a
 *  blur, unless `blurTarget` is wired -- see FOLLOWUPS G1. */
export function Input({ label, error, required, editable = true, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const disabled = !editable;

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
      <View
        style={[
          styles.clip,
          glassEdge,
          {
            borderColor: error ? color.riskCritical : focused ? color.accent : glass.edgeHairline,
            opacity: disabled ? 0.6 : 1,
          },
          focused ? styles.focusRing : null,
        ]}
      >
        <BlurView intensity={35} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.sunken.fill }]} />
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
      </View>
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
    overflow: "hidden",
    justifyContent: "center",
  },
  input: {
    height: 44,
    paddingHorizontal: space[3],
    backgroundColor: "transparent",
    // RN-web's <input> element defaults to a static (non-positioned) box, unlike View's
    // implicit `relative` -- without this it paints BEHIND the absolutely-positioned
    // BlurView/tint siblings regardless of JSX order, so `backdrop-filter` blurs the text
    // itself instead of only what's behind the field. Confirmed live: this exact field was
    // the one primitive where the placeholder rendered as an illegible blur, not just faint.
    position: "relative",
    zIndex: 1,
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
