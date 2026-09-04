// Service layer untuk Channels — list and create WhatsApp channels.

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface ChannelContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export type ChannelResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

async function resolveDevice(deviceId: string, tenantId: string) {
  return queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, tenantId]
  );
}

// ── List Channels ───────────────────────────────────────────────────────────

export async function executeListChannels(
  deviceId: string,
  ctx: ChannelContext
): Promise<ChannelResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-channels:list:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await resolveDevice(deviceId, ctx.tenantId);
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const channels = await openwa.listChannels(device.openwaSessionId);
    logEvent("info", "channels_list_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId, count: channels.length });
    return { ok: true, status: 200, body: { ok: true, deviceId, channels } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "channels_list_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/channels") };
    }
    return { ok: false, status: 500, error: "Gagal mengambil daftar channel" };
  }
}

// ── Create Channel ──────────────────────────────────────────────────────────

export async function executeCreateChannel(
  deviceId: string,
  input: { name: string; description?: string },
  ctx: ChannelContext
): Promise<ChannelResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (!input.name || input.name.trim().length === 0) {
    return { ok: false, status: 400, error: "name is required" };
  }

  const rl = await checkRateLimit(`v1-channels:create:key:${ctx.keyId}`, 10, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await resolveDevice(deviceId, ctx.tenantId);
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const channel = await openwa.createChannel(device.openwaSessionId, {
      name: input.name.trim(),
      ...(input.description ? { description: input.description } : {}),
    });
    logEvent("info", "channel_created", ctx.requestId, { tenantId: ctx.tenantId, deviceId, name: input.name.trim() });
    return { ok: true, status: 200, body: { ok: true, deviceId, channel } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "channel_create_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/channels") };
    }
    return { ok: false, status: 500, error: "Gagal membuat channel" };
  }
}
