import { color } from "@collegeos/design/native";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { textStyle } from "../../design/typography";

export interface LabelProps {
  children: string;
  required?: boolean | undefined;
  style?: StyleProp<TextStyle>;
}

export function Label({ children, required, style }: LabelProps) {
  return (
    <Text style={[textStyle("label", color.inkMuted), style]}>
      {children}
      {required ? <Text style={{ color: color.riskCritical }}> *</Text> : null}
    </Text>
  );
}
