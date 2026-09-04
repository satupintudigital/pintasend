// Service layer untuk POST/DELETE /v1/contacts/:number/block — memisahkan logika
// bisnis dari route handler (SRP), sama seperti checkContact.ts.
//
// Tanggung jawab: normalisasi kontak → rate limit per key → pilih device ready →
// block/unblock via OpenWA (contacts/:contactId/block) → map hasil. Route hanya
// verifikasi API key lalu delegasi ke sini.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface BlockContactContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface BlockContactInput {
  /** Nomor (0812…, 62812…, +62…) atau JID lengkap (…@c.us / …@g.us / …@lid). */
  number: string;
  /** \"block\" atau \"unblock\". */
  action: "block" | "unblock";
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
}

export type BlockContactResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeBlockContact(
  input: BlockContactInput,
  ctx: BlockContactContext,
): Promise<BlockContactResult> {
  // 1. Normalisasi kontak → JID (nomor 08…/628… → @c.us; JID penuh dibiarkan).
  const contactId = normalizeChatId(input.number);
  if (!contactId) {
    return {
      ok: false,
      status: 400,
      error: "Kontak tidak valid. Gunakan format 6281234567890 atau JID (…@c.us / …@g.us)",
    };
  }

  // 2. Rate limit per API key — bucket terpisah dari kirim pesan.
  const rl = await checkRateLimit(`v1-contacts-block:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "contacts_block_rate_limited", ctx.requestId, {
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

  // 4. Block/unblock via OpenWA.
  const blocking = input.action === "block";
  try {
    await (blocking
      ? openwa.blockContact(device.openwaSessionId, contactId)
      : openwa.unblockContact(device.openwaSessionId, contactId));
    logEvent("info", blocking ? "contacts_block_success" : "contacts_unblock_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      contactId,
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, contactId, blocked: blocking },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Detail internal (status/message) HANYA di log — pesan publik generik.
      logEvent("error", blocking ? "contacts_block_failed" : "contacts_unblock_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        contactId,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/contacts/block") };
    }
    logEvent("error", blocking ? "contacts_block_failed" : "contacts_unblock_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      contactId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal memproses permintaan" };
  }
}
