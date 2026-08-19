import { radius, riskBandColor, space, type RiskBand } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

export type { RiskBand };

export interface RiskPillProps {
  band: RiskBand;
  /** Always required — color is never the only carrier of the band. */
  label: string;
}

export function RiskPill({ band, label }: RiskPillProps) {
  const { fg, wash } = riskBandColor[band];
  return (
    <View style={[styles.pill, { backgroundColor: wash }]}>
      <Text style={textStyle("label", fg)}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});
