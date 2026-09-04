// Service layer untuk GET/PATCH /v1/devices/:deviceId/config — session tunable config.
// Mengontrol autoRejectCalls, reconnect attempts, dan reconnect delay.

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface DeviceConfigContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export interface SessionConfig {
  autoRejectCalls: boolean;
  maxReconnectAttempts: number | null;
  reconnectBaseDelay: number;
}

export type DeviceConfigResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

// ── Get Config ──────────────────────────────────────────────────────────────

export async function executeGetDeviceConfig(
  deviceId: string,
  ctx: DeviceConfigContext
): Promise<DeviceConfigResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-device-config:get:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const config = await openwa.getConfig(device.openwaSessionId);
    logEvent("info", "device_config_get_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId });
    return { ok: true, status: 200, body: { ok: true, deviceId, config } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "device_config_get_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/config") };
    }
    return { ok: false, status: 500, error: "Gagal mengambil config" };
  }
}

// ── Patch Config ────────────────────────────────────────────────────────────

export async function executePatchDeviceConfig(
  deviceId: string,
  input: {
    autoRejectCalls?: boolean;
    maxReconnectAttempts?: number | null;
    reconnectBaseDelay?: number;
  },
  ctx: DeviceConfigContext
): Promise<DeviceConfigResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-device-config:patch:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  // Validate input
  if (input.reconnectBaseDelay !== undefined && (typeof input.reconnectBaseDelay !== "number" || input.reconnectBaseDelay < 1000)) {
    return { ok: false, status: 400, error: "reconnectBaseDelay must be a number >= 1000 (ms)" };
  }
  if (input.maxReconnectAttempts !== undefined && input.maxReconnectAttempts !== null && (typeof input.maxReconnectAttempts !== "number" || input.maxReconnectAttempts < 0)) {
    return { ok: false, status: 400, error: "maxReconnectAttempts must be a non-negative number or null" };
  }

  try {
    const config = await openwa.patchConfig(device.openwaSessionId, input);
    logEvent("info", "device_config_patch_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId, input });
    return { ok: true, status: 200, body: { ok: true, deviceId, config } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "device_config_patch_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/config") };
    }
    return { ok: false, status: 500, error: "Gagal memperbarui config" };
  }
}
