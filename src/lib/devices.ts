import { query, queryOne } from "@/lib/db";
import { queryD1 } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";
import { openwa, openwaWebhookSecret } from "@/lib/openwa";
import { deleteCachedDeviceList } from "@/lib/deviceCache";

export interface DeviceRow {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  openwaWebhookId: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const DEVICE_COLUMNS = `id, "tenantId", label, "openwaSessionId", "openwaWebhookId", phone, status, "createdAt", "updatedAt"`;

export async function listDevicesForTenant(tenantId: string): Promise<DeviceRow[]> {
  return query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM "Device" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`,
    [tenantId],
  );
}

export async function getDeviceForTenant(
  deviceId: string,
  tenantId: string,
): Promise<DeviceRow | undefined> {
  return queryOne<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM "Device" WHERE id = $1 AND "tenantId" = $2`,
    [deviceId, tenantId],
  );
}

// URL ingest webhook Wavio — didaftarkan ke OpenWA per session.
function openwaWebhookUrl(): string {
  const base = process.env.WAVIO_PUBLIC_BASE_URL ?? "https://wavio.satupintudigital.co.id";
  return `${base}/api/webhooks/openwa`;
}

/**
 * Buat device: create session OpenWA → daftar webhook (message.received,
 * session.status) → INSERT Device (Neon) → clone D1 → invalidasi cache.
 * Gagal di tengah → bersihkan session/webhook OpenWA (hindari orphan).
 * Dipakai route /api/devices (dashboard) & /api/connect/device (wizard SSO).
 */
export async function createDeviceAndStart(
  label: string,
  tenantId: string,
): Promise<{ id: string; openwaSessionId: string; status: string }> {
  const deviceId = uuidv7();
  const sessionName = `wavio-${deviceId.replace(/-/g, "").slice(0, 12)}`;

  const owa = await openwa.createSession(sessionName);
  let openwaWebhookId: string | null = null;
  try {
    const wh = await openwa.registerWebhook(owa.id, {
      url: openwaWebhookUrl(),
      events: ["message.received", "session.status"],
      secret: await openwaWebhookSecret(owa.id),
      retryCount: 3,
    });
    openwaWebhookId = wh.id;
  } catch (whErr) {
    await openwa.deleteSession(owa.id).catch(() => {});
    throw whErr;
  }

  const now = new Date().toISOString();
  try {
    await query(
      'INSERT INTO "Device" (id, "tenantId", label, "openwaSessionId", "openwaWebhookId", status, "createdAt", "updatedAt") ' +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
      [deviceId, tenantId, label, owa.id, openwaWebhookId, owa.status, now],
    );
  } catch (dbErr) {
    if (openwaWebhookId) await openwa.deleteWebhook(owa.id, openwaWebhookId).catch(() => {});
    await openwa.deleteSession(owa.id).catch(() => {});
    throw dbErr;
  }
  await cloneDeviceToD1({
    id: deviceId,
    tenantId,
    label,
    openwaSessionId: owa.id,
    openwaWebhookId,
    phone: null,
    status: owa.status,
    createdAt: now,
    updatedAt: now,
  }).catch((e) => console.error("devices: clone D1 gagal:", e));
  await deleteCachedDeviceList(tenantId);
  return { id: deviceId, openwaSessionId: owa.id, status: owa.status };
}

/** Lookup device by OpenWA session id (Neon) — fallback ingest saat D1 miss. */
export async function getDeviceBySessionId(
  sessionId: string,
): Promise<DeviceRow | undefined> {
  return queryOne<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM "Device" WHERE "openwaSessionId" = $1`,
    [sessionId],
  );
}

// ── Replika D1 (write-through, sama pola authStore) ──────────────────────────
// D1 dipakai jalur baca cepat: ingest webhook (openwaSessionId → device) dan
// dashboard. Gagal clone → log; konsistensi dikembalikan oleh d1-resync job.

export async function cloneDeviceToD1(d: DeviceRow): Promise<void> {
  await queryD1(
    "INSERT OR REPLACE INTO Device (id, tenantId, label, openwaSessionId, openwaWebhookId, phone, status, createdAt, updatedAt) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      d.id,
      d.tenantId,
      d.label,
      d.openwaSessionId,
      d.openwaWebhookId,
      d.phone,
      d.status,
      d.createdAt,
      d.updatedAt,
    ],
  );
}

export async function deleteDeviceFromD1(id: string): Promise<void> {
  await queryD1("DELETE FROM Device WHERE id = ?", [id]);
}
