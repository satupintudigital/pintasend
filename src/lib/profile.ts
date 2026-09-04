// Service layer untuk Profile operations — get, update, picture CRUD.
// Profile = display name, about text, profile picture for the WhatsApp account.

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface ProfileContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export type ProfileResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

// ── Get Profile ─────────────────────────────────────────────────────────────

export async function executeGetProfile(
  deviceId: string,
  ctx: ProfileContext
): Promise<ProfileResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-device-profile:get:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const profile = await openwa.getProfile(device.openwaSessionId);
    logEvent("info", "profile_get_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId });
    return { ok: true, status: 200, body: { ok: true, deviceId, profile } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "profile_get_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/profile") };
    }
    return { ok: false, status: 500, error: "Gagal mengambil profil" };
  }
}

// ── Patch Profile ───────────────────────────────────────────────────────────

export async function executePatchProfile(
  deviceId: string,
  input: { name?: string; about?: string },
  ctx: ProfileContext
): Promise<ProfileResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (input.name === undefined && input.about === undefined) {
    return { ok: false, status: 400, error: "At least one of name or about is required" };
  }

  const rl = await checkRateLimit(`v1-device-profile:patch:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const profile = await openwa.patchProfile(device.openwaSessionId, input);
    logEvent("info", "profile_patch_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId, input });
    return { ok: true, status: 200, body: { ok: true, deviceId, profile } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "profile_patch_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/profile") };
    }
    return { ok: false, status: 500, error: "Gagal memperbarui profil" };
  }
}

// ── Get Profile Picture ─────────────────────────────────────────────────────

export async function executeGetProfilePicture(
  deviceId: string,
  ctx: ProfileContext
): Promise<{ ok: true; stream: ReadableStream; contentType: string } | { ok: false; status: number; error: string; retryAfterSec?: number }> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-device-profile-pic:get:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const res = await openwa.getProfilePicture(device.openwaSessionId);
    if (!res.ok) {
      logEvent("error", "profile_picture_get_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, httpStatus: res.status });
      return { ok: false, status: 502, error: "Gagal mengambil foto profil" };
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    logEvent("info", "profile_picture_get_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId });
    return { ok: true, stream: res.body!, contentType };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "profile_picture_get_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/profile/picture") };
    }
    return { ok: false, status: 500, error: "Gagal mengambil foto profil" };
  }
}

// ── Set Profile Picture ─────────────────────────────────────────────────────

export async function executeSetProfilePicture(
  deviceId: string,
  input: { imageBase64: string; mimetype: string },
  ctx: ProfileContext
): Promise<ProfileResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (!input.imageBase64) return { ok: false, status: 400, error: "imageBase64 is required" };
  if (!input.mimetype) return { ok: false, status: 400, error: "mimetype is required" };

  const rl = await checkRateLimit(`v1-device-profile-pic:set:key:${ctx.keyId}`, 10, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    await openwa.setProfilePicture(device.openwaSessionId, input.imageBase64, input.mimetype);
    logEvent("info", "profile_picture_set_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId });
    return { ok: true, status: 200, body: { ok: true, deviceId, success: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "profile_picture_set_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/profile/picture") };
    }
    return { ok: false, status: 500, error: "Gagal mengatur foto profil" };
  }
}

// ── Delete Profile Picture ──────────────────────────────────────────────────

export async function executeDeleteProfilePicture(
  deviceId: string,
  ctx: ProfileContext
): Promise<ProfileResult> {
  if (!deviceId) return { ok: false, status: 400, error: "deviceId is required" };

  const rl = await checkRateLimit(`v1-device-profile-pic:del:key:${ctx.keyId}`, 10, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, ctx.tenantId]
  );
  if (!device) return { ok: false, status: 404, error: "Device not found" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    await openwa.deleteProfilePicture(device.openwaSessionId);
    logEvent("info", "profile_picture_delete_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId });
    return { ok: true, status: 200, body: { ok: true, deviceId, success: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "profile_picture_delete_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/devices/profile/picture") };
    }
    return { ok: false, status: 500, error: "Gagal menghapus foto profil" };
  }
}
