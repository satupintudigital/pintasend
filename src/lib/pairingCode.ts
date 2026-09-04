// Service layer untuk POST /v1/devices/:deviceId/pairing-code — request pairing code.
// Alternative to QR code scanning: user enters a 8-digit code on their phone.

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface PairingCodeContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export type PairingCodeResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeRequestPairingCode(
  deviceId: string,
  phoneNumber: string,
  ctx: PairingCodeContext
): Promise<PairingCodeResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (!phoneNumber || phoneNumber.trim().length === 0) {
    return { ok: false, status: 400, error: "phoneNumber is required" };
  }

  // Normalize phone: strip +, spaces, dashes
  const normalized = phoneNumber.replace(/[\s\-+]/g, "");
  if (!/^\d{10,15}$/.test(normalized)) {
    return { ok: false, status: 400, error: "phoneNumber must be 10-15 digits (e.g. 6281234567890)" };
  }

  const rl = await checkRateLimit(`v1-device-pairing:key:${ctx.keyId}`, 10, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  // Pairing code can be requested even when not ready (e.g. during initial setup)
  // but the session must exist (not logged out)

  try {
    const result = await openwa.requestPairingCode(device.openwaSessionId, normalized);
    logEvent("info", "pairing_code_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId });
    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId, pairingCode: result.pairingCode, status: result.status },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "pairing_code_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/pairing-code") };
    }
    return { ok: false, status: 500, error: "Gagal meminta pairing code" };
  }
}
