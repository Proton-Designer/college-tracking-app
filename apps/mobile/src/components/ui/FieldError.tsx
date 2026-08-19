import { color } from "@collegeos/design/native";
import { Text } from "react-native";
import { textStyle } from "../../design/typography";

export interface FieldErrorProps {
  children: string;
}

/** Always paired with a `risk-critical` border on the field itself — color alone is never the error. */
export function FieldError({ children }: FieldErrorProps) {
  return (
    <Text accessibilityRole="alert" style={textStyle("bodyS", color.riskCritical)}>
      {children}
    </Text>
  );
}
