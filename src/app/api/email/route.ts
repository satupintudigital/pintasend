// Kirim email via Resend. Hanya user terautentikasi; rate-limited per
// tenant+IP — pengiriman email = biaya API per email, jadi endpoint mutasi
// ini butuh guard ganda (lihat pola device-create di api/devices).
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_HTML = 100_000;
const MAX_TO = 50;

function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

// "Nama <email@domain>" atau "email@domain" → ambil bagian email-nya saja
// untuk validasi (Resend menerima format display name).
function emailPart(value: string): string {
  const m = /<([^<>]+)>/.exec(value);
  return (m ? m[1] : value).trim();
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`email-send:${tenantId}:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Body JSON tidak valid" }, { status: 400 });

  // from: opsional → fallback EMAIL_FROM (env) / sender wavio.satupintudigital.co.id
  // (domain yang diverifikasi di Resend). Sandbox sender onboarding@resend.dev
  // sengaja TIDAK dipakai sebagai fallback — hanya untuk tes awal.
  const rawFrom = typeof body.from === "string" ? body.from.trim() : "";
  const from = rawFrom || process.env.EMAIL_FROM || "Wavio <noreply@wavio.satupintudigital.co.id>";
  if (from.length > 200 || !isEmail(emailPart(from))) {
    return Response.json({ error: "From tidak valid" }, { status: 400 });
  }

  // to: string atau array string, maks 50 penerima.
  const rawTo = body.to;
  const rawToList = Array.isArray(rawTo) ? rawTo : [rawTo];
  const toList: string[] = [];
  for (const t of rawToList) {
    if (typeof t !== "string") {
      return Response.json({ error: "To tidak valid" }, { status: 400 });
    }
    const trimmed = t.trim();
    if (!isEmail(trimmed)) {
      return Response.json({ error: "To tidak valid" }, { status: 400 });
    }
    toList.push(trimmed);
  }
  if (toList.length === 0 || toList.length > MAX_TO) {
    return Response.json(
      { error: `To wajib diisi, maksimal ${MAX_TO} penerima` },
      { status: 400 },
    );
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  if (!subject || subject.length > MAX_SUBJECT) {
    return Response.json(
      { error: `Subject wajib diisi, maksimal ${MAX_SUBJECT} karakter` },
      { status: 400 },
    );
  }

  const html = typeof body.html === "string" ? body.html.trim() : "";
  if (!html || html.length > MAX_HTML) {
    return Response.json(
      { error: `Html wajib diisi, maksimal ${MAX_HTML} karakter` },
      { status: 400 },
    );
  }

  try {
    const { id } = await sendEmail({ from, to: toList, subject, html });
    return Response.json({ email: { id } });
  } catch (e) {
    return Response.json(
      { error: String((e as Error)?.message ?? e) },
      { status: 502 },
    );
  }
}
