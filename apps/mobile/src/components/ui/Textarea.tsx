import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";
import { Label } from "./Label";

export interface TextareaProps extends Omit<TextInputProps, "style" | "multiline"> {
  label?: string;
  error?: string;
  required?: boolean;
  rows?: number;
}

export function Textarea({ label, error, required, editable = true, rows = 4, ...rest }: TextareaProps) {
  const [focused, setFocused] = useState(false);
  const disabled = !editable;

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
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
        style={[
          styles.input,
          textStyle("body", disabled ? color.inkFaint : color.ink),
          {
            minHeight: rows * 22,
            borderColor: error ? color.riskCritical : focused ? color.accent : color.border,
            opacity: disabled ? 0.6 : 1,
          },
          focused ? styles.focusRing : null,
        ]}
        {...rest}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: color.surfaceSunken,
    textAlignVertical: "top",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
