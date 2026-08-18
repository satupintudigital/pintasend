import type { Metadata } from "next";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
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
  metadataBase: new URL("https://wavio.satupintudigital.co.id"),
  title: "Wavio — WhatsApp API Gateway untuk Bisnis",
  description:
    "Sambungkan nomor WhatsApp, kirim notifikasi transaksi, dan balas pelanggan lewat satu API Wavio.",
  keywords: [
    "WhatsApp API",
    "WhatsApp gateway",
    "notifikasi transaksi",
    "webhook WhatsApp",
    "API Indonesia",
  ],
  openGraph: {
    title: "Wavio — WhatsApp API Gateway untuk Bisnis",
    description:
      "Kirim pesan WhatsApp, semudah memanggil API. Sambungkan nomor bisnismu dan kirim notifikasi dalam hitungan menit.",
    url: "https://wavio.satupintudigital.co.id",
    siteName: "Wavio",
    locale: "id_ID",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Wavio — WhatsApp API Gateway untuk Bisnis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wavio — WhatsApp API Gateway untuk Bisnis",
    description:
      "Kirim pesan WhatsApp, semudah memanggil API. Sambungkan nomor bisnismu dan kirim notifikasi dalam hitungan menit.",
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
        <a
          href="#main"
          className="sr-only z-[100] rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Lewati ke konten utama
        </a>
        <div aria-hidden className="bk-grain" />
        {children}
      </body>
    </html>
  );
}
