// Service layer untuk Presence operations — set online/offline, subscribe, get status.
// Presence = "typing...", "online", "last seen" indicators for WhatsApp chats.

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface PresenceContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export type PresenceResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

// ── Helper: resolve device ──────────────────────────────────────────────────

async function resolveDevice(
  deviceId: string,
  tenantId: string
): Promise<{ id: string; openwaSessionId: string; status: string } | undefined> {
  return queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, tenantId]
  );
}

// ── Set Own Presence ────────────────────────────────────────────────────────

export async function executeSetOwnPresence(
  deviceId: string,
  available: boolean,
  ctx: PresenceContext
): Promise<PresenceResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-device-presence:set:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await resolveDevice(deviceId, ctx.tenantId);
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    await openwa.setOwnPresence(device.openwaSessionId, available);
    logEvent("info", "presence_set_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId, available });
    return { ok: true, status: 200, body: { ok: true, deviceId, available } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "presence_set_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/presence") };
    }
    return { ok: false, status: 500, error: "Gagal mengatur presence" };
  }
}

// ── Subscribe to Presence ───────────────────────────────────────────────────

export async function executeSubscribePresence(
  deviceId: string,
  chatId: string,
  ctx: PresenceContext
): Promise<PresenceResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (!chatId) return { ok: false, status: 400, error: "chatId is required" };

  const rl = await checkRateLimit(`v1-device-presence:sub:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await resolveDevice(deviceId, ctx.tenantId);
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    await openwa.subscribePresence(device.openwaSessionId, chatId);
    logEvent("info", "presence_subscribe_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId, chatId });
    return { ok: true, status: 200, body: { ok: true, deviceId, chatId, subscribed: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "presence_subscribe_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/presence/subscribe") };
    }
    return { ok: false, status: 500, error: "Gagal subscribe presence" };
  }
}

// ── Get Presence ────────────────────────────────────────────────────────────

export async function executeGetPresence(
  deviceId: string,
  chatId: string,
  ctx: PresenceContext
): Promise<PresenceResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (!chatId) return { ok: false, status: 400, error: "chatId is required" };

  const rl = await checkRateLimit(`v1-device-presence:get:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await resolveDevice(deviceId, ctx.tenantId);
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const presence = await openwa.getPresence(device.openwaSessionId, chatId);
    logEvent("info", "presence_get_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId, chatId });
    return { ok: true, status: 200, body: { ok: true, deviceId, presence } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "presence_get_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/presence") };
    }
    return { ok: false, status: 500, error: "Gagal mengambil presence" };
  }
}
