import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CollegeOS",
  description: "A personal closed-loop operating system for a college student.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
