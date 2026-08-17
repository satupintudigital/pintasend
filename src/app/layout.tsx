import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Wavio - WhatsApp API Gateway untuk Bisnis",
  description:
    "Sambungkan nomor WhatsApp, kirim notifikasi transaksi, dan balas pelanggan lewat satu API Wavio.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="bg-ink text-fg antialiased">
        {children}
      </body>
    </html>
  );
}
