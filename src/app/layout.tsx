import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Rajdhani, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { initAnalytics } from "@/services/firebase/client";
import { ORG } from "@/lib/constants";
import { ThemeBoot } from "@/components/common/theme-boot";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  display: "swap",
});

/** Rajdhani — angka statistik & skor (FIRESTORM §3). */
const rajdhani = Rajdhani({
  variable: "--font-stat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

/** Barlow Condensed — judul broadcast (fallback Space Grotesk bila Google Fonts gagal). */
const barlow = Barlow_Condensed({
  variable: "--font-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${ORG.brand} — ${ORG.tournament}`,
    template: `%s · ${ORG.brand}`,
  },
  description: `Platform manajemen turnamen esports Free Fire, leaderboard realtime, dan broadcast profesional ${ORG.tournament} — ${ORG.institution}. Dibuat oleh ${ORG.developer}.`,
  keywords: ["ZEROID ESPORTS", "Battle Off Friends", "BOF", "turnamen Free Fire", "esports sekolah", "leaderboard", "SMK TI Bali Global Karangasem"],
  authors: [{ name: ORG.developer }],
  openGraph: {
    title: `${ORG.brand} — ${ORG.tournament}`,
    description: "Turnamen, leaderboard realtime, dan siaran profesional esports sekolah.",
    siteName: ORG.brand,
    type: "website",
    locale: "id_ID",
  },
};

export const viewport: Viewport = {
  themeColor: "#FF5A1F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  void initAnalytics();
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${grotesk.variable} ${rajdhani.variable} ${barlow.variable} antialiased bg-fs-bg text-fs-text min-h-screen flex flex-col`}
      >
        <ThemeBoot />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
