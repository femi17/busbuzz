import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  DM_Sans,
  DM_Serif_Display,
  IBM_Plex_Mono,
} from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

// Bold grotesque display — the "destination board" / danfo-signage voice.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BusBuzz — School bus tracking",
  description: "Real-time school bus tracking for private schools across Nigeria.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerifDisplay.variable} ${plexMono.variable} ${bricolage.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full flex flex-col bg-canvas">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
