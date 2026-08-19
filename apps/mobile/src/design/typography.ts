import { type as typeScale } from "@collegeos/design/native";
import type { TextStyle } from "react-native";
import { resolveFontFamily } from "./fonts";

type TypeStepName = keyof typeof typeScale;

/** Builds a full RN TextStyle from a `packages/design` type-scale step, incl. resolved font asset. */
export function textStyle(stepName: TypeStepName, color: string): TextStyle {
  const step = typeScale[stepName];
  return {
    fontFamily: resolveFontFamily(step),
    fontSize: step.fontSize,
    lineHeight: step.lineHeight,
    letterSpacing: step.tracking * step.fontSize,
    color,
    ...(step.uppercase ? { textTransform: "uppercase" as const } : null),
    fontVariant: ["tabular-nums"],
  };
}
