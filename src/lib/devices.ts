import { query, queryOne } from "@/lib/db";

export interface DeviceRow {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const DEVICE_COLUMNS = `id, "tenantId", label, "openwaSessionId", phone, status, "createdAt", "updatedAt"`;

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
