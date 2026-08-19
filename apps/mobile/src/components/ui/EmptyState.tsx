import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** States what the screen is for and gives one action. Never an illustration, never a mood. */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={textStyle("title", color.ink)}>{title}</Text>
      <Text style={textStyle("body", color.inkMuted)}>{description}</Text>
      {actionLabel && onAction ? (
        <Button variant="secondary" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    gap: space[3],
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: color.hairline,
    padding: space[8],
  },
});
