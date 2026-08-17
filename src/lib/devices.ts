import { query, queryOne } from "@/lib/db";
import { queryD1 } from "@/lib/d1";

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
