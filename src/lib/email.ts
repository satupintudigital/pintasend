// Klien email Resend — satu-satunya jalur pengiriman email di PintaSend.
// API key dibaca dari env RESEND_API_KEY (bukan hardcode), mengikuti pola
// modul integrasi lain (lihat openwa.ts). Import relatif agar ikut ter-test
// di vitest (alias @/ tidak di-resolve di sana).
import { Resend } from "resend";

function config() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
  };
}

// SDK Resend melempar error saat konstruksi tanpa key — client dibuat lazy
// agar modul ini aman di-import walau RESEND_API_KEY belum diset.
let client: Resend | null = null;
function getClient(): Resend {
  const { apiKey } = config();
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY belum diset — isi di .env (lokal) atau wrangler secret put RESEND_API_KEY (Worker)",
    );
  }
  client ??= new Resend(apiKey);
  return client;
}

/** Reset client internal (khusus test — pola sama dengan _resetRateLimits). */
export function _resetEmailClient() {
  client = null;
}

export interface SendEmailInput {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
}

// Kirim email via Resend. Lempar error kalau API menolak (key invalid, sender
// belum diverifikasi, dll) — pemanggil cukup bungkus try/catch.
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const { data, error } = await getClient().emails.send(input);
  if (error) {
    throw new Error(`Resend gagal mengirim email: ${error.message}`);
  }
  return data;
}

// ── Email transaksional ────────────────────────────────────────────────────

// Escape HTML untuk nilai user (nama, dll) yang disisipkan ke body email.
function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function appBaseUrl(): string {
  return process.env.PINTSEND_PUBLIC_BASE_URL ?? "https://pintasend.satupintudigital.co.id";
}

// Email selamat datang untuk user baru (dipanggil dari alur pembuatan akun:
// provisioning tenant & tambah member). Sengaja TIDAK pernah throw — email
// adalah fitur opsional: tanpa RESEND_API_KEY atau saat pengiriman gagal,
// cukup di-log. Pembuatan akun harus tetap sukses apa pun status email.
export async function sendWelcomeEmail(input: { email: string; name: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) return; // email belum dikonfigurasi → skip
  const from = process.env.EMAIL_FROM || "PintaSend <noreply@pintasend.satupintudigital.co.id>";
  const firstName = escHtml(input.name.trim().split(/\s+/)[0] || input.name);
  const loginUrl = `${appBaseUrl()}/login`;
  const html = [
    "<div style=\"font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.6\">",
    '  <h2 style="margin:0 0 16px;font-size:22px">Selamat datang di PintaSend 👋</h2>',
    `  <p>Hai ${firstName},</p>`,
    "  <p>Akun PintaSend kamu sudah aktif. PintaSend adalah AI gateway multi-kanal (WhatsApp, Telegram Bot, SMS) untuk bisnis — kirim pesan dan biarkan AI menjawab pelanggan 24/7, semuanya dari satu dashboard.</p>",
    `  <p style="margin:24px 0"><a href="${loginUrl}" style="display:inline-block;background:#10b981;color:#022c22;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600">Masuk ke dashboard</a></p>`,
    `  <p style="color:#666;font-size:13px">Kalau tombol di atas tidak berfungsi, buka langsung: <a href="${loginUrl}">${loginUrl}</a></p>`,
    '  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">',
    '  <p style="color:#999;font-size:12px">— Tim PintaSend · Satu Pintu Digital</p>',
    "</div>",
  ].join("\n");
  try {
    await sendEmail({ from, to: input.email, subject: "Selamat datang di PintaSend 👋", html });
  } catch (e) {
    console.error("sendWelcomeEmail:", e);
  }
}
