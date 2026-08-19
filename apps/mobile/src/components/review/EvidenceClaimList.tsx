import type { EvidenceClaim } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { serifBodyStyle, textStyle } from "../../design/typography";

/** LLM_LAYER_SPEC.md §3 / the Lead's hard requirement: every claim renders its cited
 *  evidence. A claim with an empty evidence array is dropped, not rendered bare -- the
 *  schema requires evidence per claim, this is the UI half of that contract. Callers that
 *  wrap this in a titled Section must gate on this too, or an empty section heading leaks
 *  through with nothing underneath it -- see the mirrored `claimsWithEvidence` on web. */
export function claimsWithEvidence(claims: EvidenceClaim[]): EvidenceClaim[] {
  return claims.filter((c) => c.evidence.length > 0);
}

export function EvidenceClaimList({ claims }: { claims: EvidenceClaim[] }) {
  const withEvidence = claimsWithEvidence(claims);
  if (withEvidence.length === 0) return null;

  return (
    <View style={styles.list}>
      {withEvidence.map((claim, i) => (
        <View key={i} style={styles.item}>
          <Text style={serifBodyStyle(color.ink)}>{claim.claim}</Text>
          <View style={styles.evidenceList}>
            {claim.evidence.map((e, j) => (
              <Text key={j} style={textStyle("caption", color.inkFaint)}>
                · {e}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[5],
  },
  item: {
    gap: space[2],
  },
  evidenceList: {
    gap: 2,
    paddingLeft: space[3],
  },
});
