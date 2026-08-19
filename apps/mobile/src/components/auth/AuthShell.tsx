import { color, space } from "@collegeos/design/native";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { textStyle } from "../../design/typography";

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Mirrors web's AuthShell (apps/web/src/components/auth/AuthShell.tsx) — same
 *  structure, same content order, native scroll/keyboard handling in place of a
 *  centered max-width column. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[10], paddingBottom: insets.bottom + space[10] }]}
        keyboardShouldPersistTaps="handled"
      >
        <Link href="/" style={textStyle("title", color.ink)}>
          CollegeOS
        </Link>
        <Text style={[textStyle("displayM", color.ink), styles.title]}>{title}</Text>
        {subtitle ? <Text style={[textStyle("body", color.inkMuted), styles.subtitle]}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[6] },
  title: { marginTop: space[10] },
  subtitle: { marginTop: space[2] },
  body: { marginTop: space[10] },
  footer: { marginTop: space[6] },
});
