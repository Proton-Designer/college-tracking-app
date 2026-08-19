import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { IBMPlexSans_400Regular, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { IBMPlexSerif_600SemiBold } from "@expo-google-fonts/ibm-plex-serif";
import { useFonts } from "expo-font";

/**
 * Only the weights docs/DESIGN_SYSTEM.md §3's type scale actually uses. Add a weight here (and to
 * the map below) only when a new type step needs one — every font asset costs a load-time
 * fetch/cache entry.
 */
const fontAssets = {
  IBMPlexSerif_600SemiBold,
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
};

/** Load gate: render nothing (splash stays up) until this resolves — see RootLayout. */
export function useDesignFonts() {
  return useFonts(fontAssets);
}

const FONT_NAME_BY_FAMILY_WEIGHT: Record<string, keyof typeof fontAssets> = {
  "IBM Plex Serif:600": "IBMPlexSerif_600SemiBold",
  "IBM Plex Sans:400": "IBMPlexSans_400Regular",
  "IBM Plex Sans:600": "IBMPlexSans_600SemiBold",
  "IBM Plex Mono:400": "IBMPlexMono_400Regular",
  "IBM Plex Mono:500": "IBMPlexMono_500Medium",
};

/**
 * RN's `fontFamily` style prop must name the exact loaded font asset — it can't combine a family
 * name with a `fontWeight` style the way CSS can. This resolves a `packages/design` type-scale
 * step (e.g. `type.title`) to the RN font name that's actually loaded.
 */
export function resolveFontFamily(step: { fontFamily: string; fontWeight: number }): string {
  const key = `${step.fontFamily}:${step.fontWeight}`;
  const resolved = FONT_NAME_BY_FAMILY_WEIGHT[key];
  if (!resolved) {
    throw new Error(`No loaded font for "${key}" — add the weight in apps/mobile/src/design/fonts.ts`);
  }
  return resolved;
}
