import { Geist_Mono, Instrument_Sans } from "next/font/google";

// Self-hosted via next/font — no layout shift, no request to Google at runtime.
// v2 ("Aurora", docs/DESIGN_LANGUAGE_V2.md §3) replaces Instrument's IBM Plex trio entirely:
// Instrument Sans carries display + UI, Geist Mono carries data + eyebrows. There is no serif face.

export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});
