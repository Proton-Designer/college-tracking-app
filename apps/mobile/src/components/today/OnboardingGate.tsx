import { color, space } from "@collegeos/design/native";
import { Text, View } from "react-native";
import { AddCourseModal } from "../courses/AddCourseModal";
import { Panel } from "../ui";
import { textStyle } from "../../design/typography";

/** Mirrors apps/web/src/components/today/OnboardingGate.tsx exactly. E0_ONBOARDING_SPEC.md:
 *  the daily ritual (check-in, Day Trace, workload) presupposes a semester exists. A
 *  brand-new (or fully-cleared-out) account has nothing to check in about, nothing to plan
 *  around. This replaces the entire Today body, not just an empty-state message inside it,
 *  until a real course exists. */
export function OnboardingGate({ onCreated }: { onCreated: () => void }) {
  return (
    <Panel style={{ gap: space[4], paddingVertical: space[8] }}>
      <View style={{ gap: space[1] }}>
        <Text style={textStyle("displayM", color.ink)}>Start with a course</Text>
        <Text style={textStyle("body", color.inkMuted)}>
          Today plans around your actual courses and what&apos;s due — add your first course to get a real semester in
          here. It takes under a minute: code, name, and term.
        </Text>
      </View>
      <View style={{ alignSelf: "flex-start" }}>
        <AddCourseModal onCreated={onCreated} />
      </View>
    </Panel>
  );
}
