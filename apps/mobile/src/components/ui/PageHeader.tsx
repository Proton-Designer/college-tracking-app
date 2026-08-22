import { color, space } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

export interface PageHeaderProps {
  title: string;
  /** Secondary readout next to the title -- a date, a term, a range. Never a second heading. */
  context?: string;
  /** Right-aligned page-level actions (e.g. "Add course"). */
  actions?: ReactNode;
}

/** Every screen was a title Text immediately followed by content -- there was nowhere for a
 *  page-level action to live. Formalizes the title/context/actions row a few screens already
 *  hand-rolled ad hoc (Night review's title + "Nightly report" NavLink). */
export function PageHeader({ title, context, actions }: PageHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titleGroup}>
        <Text accessibilityRole="header" style={textStyle("displayM", color.ink)}>
          {title}
        </Text>
        {context ? <Text style={textStyle("bodyS", color.inkMuted)}>{context}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[4],
  },
  titleGroup: {
    gap: space[1],
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
});
