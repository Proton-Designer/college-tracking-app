import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { geistMono, geistSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ihsan",
  description: "A personal closed-loop operating system for a college student.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full flex flex-col font-sans text-body text-ink bg-ground">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
