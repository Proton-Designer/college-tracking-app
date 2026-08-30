import type { ConfrontationOffer } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel } from "../ui";
import { textStyle } from "../../design/typography";

/**
 * The drift confrontation, mobile (D50). Mirrors the web component's rules exactly — and the rules
 * are the feature, not the styling.
 *
 * What this may not do:
 *
 * - **Add no words about the user.** The only prose about them is `offer.statement`, which they
 *   wrote. No generated line, no adjective, no "you said you wanted X but". A sentence added here
 *   would be the app forming an opinion about someone, which is the thing the feature refuses.
 * - **Never render without both doors.** They come from `offer.doors`, so the type makes a doorless
 *   confrontation unconstructible.
 * - **Use no alarm colour.** No red, no warning icon, no risk band. This is not an error state, and
 *   styling it as one would make it a scolding.
 * - **Dismissing costs nothing.** No confirmation, no counter, no follow-up.
 */
export function Confrontation({
  offer,
  onRespond,
}: {
  offer: ConfrontationOffer;
  onRespond: (response: "started_hour" | "crowned_tomorrow" | "dismissed") => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function respond(response: "started_hour" | "crowned_tomorrow" | "dismissed") {
    if (busy) return;
    setBusy(true);
    onRespond(response);
    if (response === "started_hour") router.push("/hour");
    else if (response === "crowned_tomorrow") router.push("/nightplan");
  }

  return (
    <Panel>
      {/* Flat and factual. The weight comes from their sentence below, which is the only thing
          here allowed to carry any. */}
      <Text style={textStyle("label", color.inkMuted)}>
        YOU WROTE THIS ABOUT {offer.dimensionName.toUpperCase()}
      </Text>
      <Text style={[textStyle("caption", color.inkFaint), styles.evidence]}>{offer.evidence}</Text>

      {/* Their words, at reading size, with nothing around them. */}
      <View style={styles.quote}>
        <Text style={textStyle("bodyL", color.ink)}>{offer.statement}</Text>
      </View>

      {/* From the offer, so this cannot render without them. */}
      <View style={styles.doors}>
        {offer.doors.map((door) => (
          <Pressable
            key={door}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => respond(door === "start_hour" ? "started_hour" : "crowned_tomorrow")}
            style={({ pressed }) => [
              styles.door,
              door === "start_hour" ? styles.doorPrimary : styles.doorSecondary,
              pressed && styles.doorPressed,
              busy && styles.doorDisabled,
            ]}
          >
            <Text
              style={textStyle("body", door === "start_hour" ? color.accentOn : color.ink)}
            >
              {door === "start_hour" ? "Start an Hour now" : "Crown it for tomorrow"}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => respond("dismissed")}
        hitSlop={8}
        style={styles.dismiss}
      >
        <Text style={textStyle("bodyS", color.inkMuted)}>Not now</Text>
      </Pressable>
    </Panel>
  );
}

const styles = StyleSheet.create({
  evidence: { marginTop: space[2] },
  quote: {
    marginTop: space[5],
    borderLeftWidth: 2,
    borderLeftColor: color.hairline,
    paddingLeft: space[5],
  },
  doors: { flexDirection: "row", flexWrap: "wrap", gap: space[3], marginTop: space[6] },
  door: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space[5],
    borderRadius: radius.sm,
  },
  doorPrimary: { backgroundColor: color.accent },
  doorSecondary: { borderWidth: 1, borderColor: color.border },
  doorPressed: { opacity: 0.85 },
  doorDisabled: { opacity: 0.4 },
  dismiss: { marginTop: space[4], alignSelf: "flex-start" },
});
