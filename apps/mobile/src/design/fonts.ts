import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { useFonts } from "expo-font";

/**
 * Only the weights the type scale actually uses. Add a weight here (and to the map below) only
 * when a new type step needs one — every font asset costs a load-time fetch/cache entry.
 */
const fontAssets = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  GeistMono_400Regular,
  GeistMono_500Medium,
};

/** Load gate: render nothing (splash stays up) until this resolves — see RootLayout. */
export function useDesignFonts() {
  return useFonts(fontAssets);
}

const FONT_NAME_BY_FAMILY_WEIGHT: Record<string, keyof typeof fontAssets> = {
  "Geist:400": "Geist_400Regular",
  "Geist:500": "Geist_500Medium",
  "Geist:600": "Geist_600SemiBold",
  "Geist Mono:400": "GeistMono_400Regular",
  "Geist Mono:500": "GeistMono_500Medium",
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
