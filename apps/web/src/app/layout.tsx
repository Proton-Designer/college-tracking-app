import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { plexMono, plexSans, plexSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "CollegeOS",
  description: "A personal closed-loop operating system for a college student.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full ${plexSerif.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans text-body text-ink">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
