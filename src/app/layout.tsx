import type { Metadata } from "next";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { PostHogProvider, PostHogPageView } from "@/components/PostHogProvider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pintasend.satupintudigital.co.id"),
  title: "PintaSend — AI Gateway Multi-Kanal untuk Bisnis",
  description:
    "Satu platform untuk WhatsApp, Telegram Bot, dan SMS — kirim pesan, dan biarkan AI menjawab pelanggan 24/7 lewat API PintaSend.",
  keywords: [
    "AI Gateway Multi-Kanal",
    "WhatsApp API",
    "Telegram Bot",
    "notifikasi transaksi",
    "webhook WhatsApp",
    "API Indonesia",
  ],
  openGraph: {
    title: "PintaSend — AI Gateway Multi-Kanal untuk Bisnis",
    description:
      "Kirim pesan multi-kanal lewat satu API, dan biarkan AI menjawab pelanggan 24/7. Sambungkan nomor bisnismu dalam hitungan menit.",
    url: "https://pintasend.satupintudigital.co.id",
    siteName: "PintaSend",
    locale: "id_ID",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "PintaSend — AI Gateway Multi-Kanal untuk Bisnis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PintaSend — AI Gateway Multi-Kanal untuk Bisnis",
    description:
      "Kirim pesan multi-kanal lewat satu API, dan biarkan AI menjawab pelanggan 24/7. Sambungkan nomor bisnismu dalam hitungan menit.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-ink text-fg antialiased">
        <Suspense fallback={null}>
          <PostHogProvider>
            <PostHogPageView />
            <a
              href="#main"
              className="sr-only z-[100] rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              Lewati ke konten utama
            </a>
            <div aria-hidden className="bk-grain" />
            {children}
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
