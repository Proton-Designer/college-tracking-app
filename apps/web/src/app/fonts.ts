import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";

// Self-hosted via next/font — no layout shift, no request to Google at runtime. Weights are
// pinned to exactly what docs/DESIGN_SYSTEM.md §3's type scale uses; add a weight here only if a
// new type step needs one.

export const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-plex-serif",
  display: "swap",
});

export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
