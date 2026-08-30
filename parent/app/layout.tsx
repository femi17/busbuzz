import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Martian_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const mono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BusBuzz — Track your child's bus",
  description:
    "Follow your child's school bus in real time, and get a ping the moment they board or reach their stop.",
  applicationName: "BusBuzz",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BusBuzz",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1712",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
