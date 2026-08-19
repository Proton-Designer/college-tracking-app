import { color, radius, space } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { textStyle } from "../../design/typography";

export interface PanelProps {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A readout panel sitting on the ground. No shadow — ever. Hairline + surface do the work. */
export function Panel({ title, children, style }: PanelProps) {
  return (
    <View style={[styles.panel, style]}>
      {title ? <Text style={[textStyle("title", color.ink), styles.title]}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    padding: space[5],
  },
  title: {
    marginBottom: space[3],
  },
});
