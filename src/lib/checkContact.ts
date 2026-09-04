// Service layer untuk GET /v1/contacts/check/:number — memisahkan logika bisnis
// dari route handler (SRP), sama seperti sendMessage.ts untuk POST /v1/messages.
//
// Tanggung jawab: normalisasi nomor → rate limit per key → pilih device ready →
// cek nomor via OpenWA (contacts/check) → map hasil. Route hanya verifikasi API
// key lalu delegasi ke sini.
//
// Catatan: cek nomor BUKAN kirim pesan — tidak menghitung kuota pesan, hanya
// dibatasi rate limit per API key (bucket terpisah dari kirim pesan).

import { normalizePhoneNumber } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface CheckContactContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface CheckContactInput {
  /** Nomor mentah dari path (0812…, 62812…, +62 812-…, dst.). */
  number: string;
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
}

export type CheckContactResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeCheckContact(
  input: CheckContactInput,
  ctx: CheckContactContext,
): Promise<CheckContactResult> {
  // 1. Normalisasi nomor (08…/8… → 62…; buang non-digit). Sama dengan kirim pesan.
  const phone = normalizePhoneNumber(input.number);
  if (!phone) {
    return {
      ok: false,
      status: 400,
      error: "Nomor tidak valid. Gunakan format 6281234567890 atau 081234567890",
    };
  }

  // 2. Rate limit per API key — bucket terpisah dari kirim pesan.
  const rl = await checkRateLimit(`v1-contacts-check:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "contacts_check_rate_limited", ctx.requestId, {
      tenantId: ctx.tenantId,
      keyId: ctx.keyId,
      retryAfterSec: rl.retryAfterSec,
    });
    return {
      ok: false,
      status: 429,
      error: "Terlalu banyak permintaan. Coba lagi nanti.",
      retryAfterSec: rl.retryAfterSec,
    };
  }

  // 3. Pilih device: deviceId tertentu, atau device ready pertama milik tenant.
  const device = input.deviceId
    ? await queryD1One<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?',
        [input.deviceId, ctx.tenantId],
      )
    : await queryD1One<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1',
        [ctx.tenantId, "ready"],
      );

  if (!device) {
    return {
      ok: false,
      status: input.deviceId ? 404 : 409,
      error: input.deviceId
        ? "Device tidak ditemukan untuk tenant ini"
        : "Belum ada device yang tersambung (status ready)",
    };
  }
  if (device.status !== "ready") {
    return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };
  }

  // 4. Cek nomor via OpenWA. Nomor tidak terdaftar = respons normal 200 dengan
  //    exists:false (bukan error) — hanya kegagalan gateway yang jadi error.
  try {
    const res = await openwa.checkContact(device.openwaSessionId, phone);
    const exists = res.exists === true;
    logEvent("info", "contacts_check_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      number: phone,
      exists,
    });
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        deviceId: device.id,
        number: typeof res.number === "string" ? res.number : phone,
        exists,
        whatsappId: res.whatsappId ?? null,
      },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Detail internal (status/message) HANYA di log — pesan publik generik.
      logEvent("error", "contacts_check_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        number: phone,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/contacts/check") };
    }
    logEvent("error", "contacts_check_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      number: phone,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal memeriksa nomor" };
  }
}
