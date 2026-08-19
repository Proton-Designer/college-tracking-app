import { type as typeScale } from "@collegeos/design/native";
import { fontFamily } from "@collegeos/design";
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

/** Editorial serif body text -- mirrors web's one-off `font-serif text-body-l` override for
 *  the nightly report's prose (headline/objective-summary/claim text), per SCREEN_SPEC §6:
 *  "visually distinct from the instrument chrome." Only IBM Plex Serif 600 is loaded (same
 *  constraint web has via next/font), so this renders at that weight regardless of bodyL's
 *  nominal 400 -- identical to what the browser does when only one serif face exists. */
export function serifBodyStyle(color: string): TextStyle {
  const step = typeScale.bodyL;
  return {
    fontFamily: resolveFontFamily({ fontFamily: fontFamily.serif, fontWeight: 600 }),
    fontSize: step.fontSize,
    lineHeight: step.lineHeight,
    letterSpacing: step.tracking * step.fontSize,
    color,
  };
}
