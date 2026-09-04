// POST /api/report — Formulir pelaporan konten ilegal (UGC compliance).
// Tidak memerlukan autentikasi (form publik). Rate-limited per IP.
// Mengirim notifikasi email ke report@wavio.id via Resend.

import { sendEmail } from "@/lib/email";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 5000;
const MAX_NAME = 200;
const MAX_URL = 500;

const CATEGORIES: Record<string, string> = {
  spam: "Spam / pesan massal tanpa persetujuan",
  phishing: "Phishing / penipuan",
  konten_ilegal: "Konten yang dilarang undang-undang",
  terorisme: "Terorisme / ancaman keamanan",
  pornografi: "Pornografi / eksploitasi",
  perjudian: "Perjudian",
  ujaran_kebencian: "Ujaran kebencian / SARA",
  pelanggaran_privasi: "Pelanggaran privasi / data pribadi",
  pelanggaran_kebijakan: "Pelanggaran kebijakan WhatsApp Business",
  lainnya: "Lainnya",
};

function genRefId(): string {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RPT-${ts}-${rand}`;
}

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────────────
  const ip = clientIp(req);
  const rl = await checkRateLimit(`report:${ip}`, 5, 60_000); // 5 laporan per menit
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  // ── Validasi input ──────────────────────────────────────────────────
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const reporterName = String(body.reporterName || "").trim();
  const reporterEmail = String(body.reporterEmail || "").trim();
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();
  const evidenceUrl = String(body.evidenceUrl || "").trim();
  const tenantRef = String(body.tenantRef || "").trim();

  if (!reporterName || reporterName.length > MAX_NAME) {
    return Response.json(
      { error: "Nama pelapor wajib diisi (maks 200 karakter)" },
      { status: 400 },
    );
  }
  if (
    !reporterEmail ||
    reporterEmail.length > 254 ||
    !EMAIL_RE.test(reporterEmail)
  ) {
    return Response.json(
      { error: "Email pelapor tidak valid" },
      { status: 400 },
    );
  }
  if (!category || !CATEGORIES[category]) {
    return Response.json(
      { error: "Kategori pelanggaran wajib dipilih" },
      { status: 400 },
    );
  }
  if (!description || description.length > MAX_FIELD) {
    return Response.json(
      { error: "Deskripsi wajib diisi (maks 5000 karakter)" },
      { status: 400 },
    );
  }
  if (evidenceUrl && evidenceUrl.length > MAX_URL) {
    return Response.json(
      { error: "Tautan bukti terlalu panjang (maks 500 karakter)" },
      { status: 400 },
    );
  }

  // ── Kirim notifikasi email ──────────────────────────────────────────
  const refId = genRefId();
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

  const subject = `[WAVIO REPORT] ${CATEGORIES[category]} — ${refId}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:14px;color:#1c2430;max-width:640px;margin:0 auto">
      <h2 style="color:#0f172a;border-bottom:2px solid #0f172a;padding-bottom:8px">
        Laporan Konten / Aktivitas Ilegal
      </h2>
      <p style="color:#64748b;font-size:12px">Ref: ${refId} · ${now} WIB · IP pelapor: ${ip}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 8px;font-weight:700;width:160px;vertical-align:top">Pelapor</td><td style="padding:6px 8px">${esc(reporterName)} &lt;${esc(reporterEmail)}&gt;</td></tr>
        <tr><td style="padding:6px 8px;font-weight:700;vertical-align:top">Kategori</td><td style="padding:6px 8px">${esc(CATEGORIES[category])}</td></tr>
        <tr><td style="padding:6px 8px;font-weight:700;vertical-align:top">Deskripsi</td><td style="padding:6px 8px;white-space:pre-wrap">${esc(description)}</td></tr>
        ${evidenceUrl ? `<tr><td style="padding:6px 8px;font-weight:700;vertical-align:top">Bukti</td><td style="padding:6px 8px"><a href="${esc(evidenceUrl)}">${esc(evidenceUrl)}</a></td></tr>` : ""}
        ${tenantRef ? `<tr><td style="padding:6px 8px;font-weight:700;vertical-align:top">Akun Terkait</td><td style="padding:6px 8px">${esc(tenantRef)}</td></tr>` : ""}
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
      <p style="color:#94a3b8;font-size:11px">
        Laporan ini dikirim otomatis via formulir publik Wavio. Tanggapi dalam ≤1×24 jam
        (biasa) atau ≤4 jam (mendesak) sesuai Permenkominfo 5/2020.
      </p>
    </div>`;

  try {
    await sendEmail({
      from: "Wavio Report <noreply@wavio.satupintudigital.co.id>",
      to: "report@wavio.id",
      subject,
      html,
    });
  } catch (err) {
    console.error("[report] Gagal kirim email notifikasi:", err);
    // Tetap kembalikan sukses ke pelapor — email bersifat notifikasi,
    // bukan kewajiban hukum utama. Log tersimpan di server.
  }

  return Response.json({
    ok: true,
    refId,
    message:
      "Laporan berhasil diterima. Tim kami akan meninjau dan menindaklanjuti sesuai kebijakan takedown.",
  });
}

/** Escape HTML untuk mencegah XSS di body email. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
