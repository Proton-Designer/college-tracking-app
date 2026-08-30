import { Geist, Geist_Mono } from "next/font/google";

// Self-hosted via next/font — no layout shift, no request to Google at runtime.
// v3 ("Ihsan"): Geist carries display + UI, Geist Mono carries data, eyebrows and every number.
// There is no serif face. Setting figures in mono with tabular numerals is half of why the data
// surfaces read calm -- columns of digits stop shifting as they update.

export const geistSans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});
