import { query, queryOne } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";

// Kebijakan retensi pesan Wavio (lihat Justifikasi-Retensi-30-Hari.md & DPA §5.7):
//   - Default: 30 hari (kebijakan Wavio).
//   - >30 hari HANYA bila ada RetentionRequest approved (instruksi tertulis tenant).
//   - Batas atas perpanjangan: 365 hari — di atas itu butuh kebijakan formal tersendiri.
export const DEFAULT_MESSAGE_RETENTION_DAYS = 30;
export const MAX_MESSAGE_RETENTION_DAYS = 365;

export type RetentionRequestStatus = "pending" | "approved" | "rejected";

export interface RetentionRequestRow {
  id: string;
  tenantId: string;
  requestedBy: string;
  reason: string;
  retentionDays: number;
  status: RetentionRequestStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRetentionRequestInput {
  tenantId: string;
  requestedBy: string;
  reason: string;
  retentionDays: number;
}

// Nilai retensi efektif tenant (hari). Default 30 — nilai >30 hanya sah bila
// ada RetentionRequest approved (dijaga di approveRetentionRequest).
export async function getTenantRetentionDays(tenantId: string): Promise<number> {
  const rows = await query<{ days: number | null }>(
    'SELECT "messageRetentionDays" AS days FROM "Tenant" WHERE id = $1',
    [tenantId],
  );
  const days = rows[0]?.days;
  return typeof days === "number" && days > 0 ? days : DEFAULT_MESSAGE_RETENTION_DAYS;
}

export async function listRetentionRequests(
  tenantId: string,
): Promise<RetentionRequestRow[]> {
  return query<RetentionRequestRow>(
    `SELECT id, "tenantId", "requestedBy", reason, "retentionDays", status,
            "approvedBy", "approvedAt", "rejectedBy", "rejectedAt", "createdAt", "updatedAt"
     FROM "RetentionRequest" WHERE "tenantId" = $1
     ORDER BY "createdAt" DESC`,
    [tenantId],
  );
}

// Cek apakah tenant punya permintaan pending — mencegah spam request
// (dashboard/API v1) sebelum admin sempat memproses.
export async function hasPendingRetentionRequest(tenantId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM "RetentionRequest"
     WHERE "tenantId" = $1 AND status = 'pending' LIMIT 1`,
    [tenantId],
  );
  return rows.length > 0;
}

// Catat permintaan perpanjangan retensi (instruksi tertulis dari tenant).
// Status awal: pending — menunggu persetujuan platform admin.
export async function createRetentionRequest(
  input: CreateRetentionRequestInput,
): Promise<RetentionRequestRow> {
  const rows = await query<RetentionRequestRow>(
    `INSERT INTO "RetentionRequest"
       (id, "tenantId", "requestedBy", reason, "retentionDays", status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, "tenantId", "requestedBy", reason, "retentionDays", status,
               "approvedBy", "approvedAt", "rejectedBy", "rejectedAt", "createdAt", "updatedAt"`,
    [uuidv7(), input.tenantId, input.requestedBy, input.reason, input.retentionDays],
  );
  return rows[0];
}

// Setujui permintaan → terapkan retentionDays ke Tenant (menjadi nilai efektif)
// dan tandai approved. Menolak bila permintaan sudah diproses.
export async function approveRetentionRequest(
  requestId: string,
  approvedBy: string,
): Promise<{ ok: boolean; reason?: string }> {
  const row = await queryOne<RetentionRequestRow>(
    'SELECT id, "tenantId", "retentionDays", status FROM "RetentionRequest" WHERE id = $1',
    [requestId],
  );
  if (!row) return { ok: false, reason: "Permintaan tidak ditemukan" };
  if (row.status !== "pending") {
    return { ok: false, reason: `Permintaan sudah ${row.status}` };
  }
  if (row.retentionDays > MAX_MESSAGE_RETENTION_DAYS) {
    return {
      ok: false,
      reason: `Maks. perpanjangan ${MAX_MESSAGE_RETENTION_DAYS} hari (perlu kebijakan formal)`,
    };
  }

  await query(
    'UPDATE "Tenant" SET "messageRetentionDays" = $1 WHERE id = $2',
    [row.retentionDays, row.tenantId],
  );
  await query(
    `UPDATE "RetentionRequest" SET status = 'approved', "approvedBy" = $2,
       "approvedAt" = now(), "updatedAt" = now() WHERE id = $1`,
    [requestId, approvedBy],
  );
  return { ok: true };
}

// Tolak permintaan — retensi tenant tetap pada nilai sebelumnya.
export async function rejectRetentionRequest(
  requestId: string,
  rejectedBy: string,
): Promise<{ ok: boolean; reason?: string }> {
  const row = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM "RetentionRequest" WHERE id = $1',
    [requestId],
  );
  if (!row) return { ok: false, reason: "Permintaan tidak ditemukan" };
  if (row.status !== "pending") {
    return { ok: false, reason: `Permintaan sudah ${row.status}` };
  }

  await query(
    `UPDATE "RetentionRequest" SET status = 'rejected', "rejectedBy" = $2,
       "rejectedAt" = now(), "updatedAt" = now() WHERE id = $1`,
    [requestId, rejectedBy],
  );
  return { ok: true };
}
