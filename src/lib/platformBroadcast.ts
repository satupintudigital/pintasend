// ─── Platform broadcast (pengumuman platform → nomor owner device) ─────────
// Scope TERPISAH dari campaign tenant: broadcast dikirim ke `Device.phone`
// (nomor pemilik perangkat yang siap), bukan kontak tenant. Alur:
//   create (draft) → start (snapshot device ready → jobs pending) →
//   dispatcher worker klaim job (Task 11) → kirim text via openwa →
//   mark sent/failed (+ retry backoff). Hanya Neon — frekuensi rendah.

import { query } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";
import { normalizeChatId } from "@/lib/chat";

export type BroadcastStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type BroadcastTargetMode = "ready_devices" | "tenant_ids";

export interface PlatformBroadcastRow {
  id: string;
  name: string;
  messageBody: string;
  status: string;
  targetMode: string;
  tenantIds: string; // JSON array
  createdBy: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failReason: string | null;
  totalJobs: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

export interface PlatformBroadcastDetail extends PlatformBroadcastRow {
  jobSummary: { pending: number; sending: number; sent: number; failed: number; skipped: number };
}

export interface BroadcastSendTarget {
  jobId: string;
  tenantId: string;
  deviceId: string;
  deviceLabel: string | null;
  openwaSessionId: string;
  chatId: string;
}

// ── create / list / get ─────────────────────────────────────────────────────

export async function createPlatformBroadcast(
  input: {
    name: string;
    messageBody: string;
    targetMode?: BroadcastTargetMode;
    tenantIds?: string[];
    scheduledAt?: string | null;
  },
  actor: { email: string },
): Promise<{ id: string }> {
  const rows = await query<{ id: string }>(
    `INSERT INTO "PlatformBroadcast"
       (id, name, "messageBody", status, "targetMode", "tenantIds", "createdBy", "scheduledAt")
     VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
     RETURNING id`,
    [
      uuidv7(),
      input.name,
      input.messageBody,
      input.targetMode ?? "ready_devices",
      JSON.stringify(input.tenantIds ?? []),
      actor.email,
      input.scheduledAt ?? null,
    ],
  );
  return { id: rows[0].id };
}

export async function listPlatformBroadcasts(params: {
  page?: number;
  limit?: number;
}): Promise<{ items: PlatformBroadcastRow[]; total: number }> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;

  const [countRows, rows] = await Promise.all([
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "PlatformBroadcast"'),
    query<PlatformBroadcastRow>(
      `SELECT id, name, "messageBody", status, "targetMode", "tenantIds", "createdBy",
              "scheduledAt", "startedAt", "completedAt", "failReason",
              "totalJobs", "sentCount", "failedCount", "createdAt"
       FROM "PlatformBroadcast" ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
  ]);
  return { items: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getPlatformBroadcast(id: string): Promise<PlatformBroadcastDetail | null> {
  const rows = await query<PlatformBroadcastRow>(
    `SELECT id, name, "messageBody", status, "targetMode", "tenantIds", "createdBy",
            "scheduledAt", "startedAt", "completedAt", "failReason",
            "totalJobs", "sentCount", "failedCount", "createdAt"
     FROM "PlatformBroadcast" WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const summaryRows = await query<{ status: string; n: number }>(
    `SELECT status, COUNT(*)::int AS n FROM "PlatformBroadcastJob"
     WHERE "broadcastId" = $1 GROUP BY status`,
    [id],
  );
  const summary: PlatformBroadcastDetail["jobSummary"] = {
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  for (const s of summaryRows) {
    const key = s.status as keyof typeof summary;
    if (key in summary) summary[key] = s.n;
  }
  return { ...row, jobSummary: summary };
}

// ── start / cancel ──────────────────────────────────────────────────────────

interface BroadcastDeviceRow {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  phone: string | null;
}

// Snapshot perangkat sasaran: status ready, tenant AKTIF (tidak suspended),
// nomor (phone) terisi & valid. Idempoten: hanya broadcast berstatus draft
// yang bisa di-start.
export async function startPlatformBroadcast(
  id: string,
): Promise<{ ok: boolean; reason?: string; jobs?: number }> {
  const bcRows = await query<{ status: string }>(
    'SELECT status FROM "PlatformBroadcast" WHERE id = $1',
    [id],
  );
  const bc = bcRows[0];
  if (!bc) return { ok: false, reason: "Broadcast tidak ditemukan" };
  if (bc.status !== "draft") {
    return { ok: false, reason: `Broadcast berstatus ${bc.status} — hanya draft yang bisa di-start` };
  }

  // Tenants filter (opsional). Bila targetMode tenant_ids, hanya device milik
  // tenant tsb; selain itu semua device ready tenant aktif.
  const bcFull = await query<{ targetMode: string; tenantIds: string }>(
    'SELECT "targetMode", "tenantIds" FROM "PlatformBroadcast" WHERE id = $1',
    [id],
  );
  const mode = bcFull[0]?.targetMode ?? "ready_devices";
  let tenantIds: string[] = [];
  if (mode === "tenant_ids") {
    try {
      tenantIds = JSON.parse(bcFull[0]?.tenantIds ?? "[]") as string[];
    } catch {
      tenantIds = [];
    }
  }

  const devices = await query<BroadcastDeviceRow>(
    `SELECT d.id, d."tenantId", d.label, d."openwaSessionId", d.phone
     FROM "Device" d
     JOIN "Tenant" t ON t.id = d."tenantId"
     WHERE d.status = 'ready'
       AND t."suspendedAt" IS NULL
       AND d.phone IS NOT NULL
       ${mode === "tenant_ids" && tenantIds.length > 0 ? "AND d.\"tenantId\" = ANY($1)" : ""}
     ORDER BY d."tenantId", d.label`,
    mode === "tenant_ids" && tenantIds.length > 0 ? [tenantIds] : [],
  );
  if (devices.length === 0) {
    return { ok: false, reason: "Tidak ada perangkat siap yang menjadi sasaran" };
  }

  // Snapshot → jobs pending (satu query multi-row), lalu tandai running.
  const values: string[] = [];
  const args: unknown[] = [];
  devices.forEach((d) => {
    const chatId = normalizeChatId(d.phone ?? "");
    values.push(`($${args.length + 1}, $${args.length + 2}, $${args.length + 3}, $${args.length + 4}, $${args.length + 5}, $${args.length + 6}, 'pending')`);
    args.push(uuidv7(), id, d.tenantId, d.id, d.label, chatId || null);
  });
  await query(
    `INSERT INTO "PlatformBroadcastJob"
       (id, "broadcastId", "tenantId", "deviceId", "deviceLabel", "chatId", status)
     VALUES ${values.join(", ")}`,
    args,
  );
  await query(
    `UPDATE "PlatformBroadcast"
     SET status = 'running', "startedAt" = now(), "totalJobs" = $1 WHERE id = $2`,
    [devices.length, id],
  );
  return { ok: true, jobs: devices.length };
}

export async function cancelPlatformBroadcast(
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const rows = await query<{ id: string }>(
    `UPDATE "PlatformBroadcast" SET status = 'cancelled', "completedAt" = now()
     WHERE id = $1 AND status IN ('draft', 'running') RETURNING id`,
    [id],
  );
  if (rows.length === 0) return { ok: false, reason: "Broadcast tidak ditemukan atau sudah selesai" };
  return { ok: true };
}

// ── Dispatcher job queue (Task 11 memakai ini) ──────────────────────────────

interface PendingJobRow {
  id: string;
  tenantId: string;
  deviceId: string;
  deviceLabel: string | null;
  openwaSessionId: string;
  chatId: string | null;
}

/**
 * Klaim job pending milik broadcast RUNNING. Lock pakai `lockedAt` (klaim
 * dispatcher) — job yang terkunci > 10 menit dianggap stale & bisa diklaim
 * ulang (recovery kalau dispatcher mati di tengah kirim).
 */
export async function claimPendingBroadcastJobs(limit = 20): Promise<BroadcastSendTarget[]> {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const rows = await query<PendingJobRow>(
    `UPDATE "PlatformBroadcastJob" j
     SET "lockedAt" = now(), "updatedAt" = now()
     FROM "PlatformBroadcast" b
     WHERE j."broadcastId" = b.id
       AND j.status = 'pending'
       AND b.status = 'running'
       AND (j."nextAttemptAt" IS NULL OR j."nextAttemptAt" <= now())
       AND (j."lockedAt" IS NULL OR j."lockedAt" <= $1::timestamptz)
     RETURNING j.id, j."tenantId", j."deviceId", j."deviceLabel", j."chatId",
               (SELECT "openwaSessionId" FROM "Device" d WHERE d.id = j."deviceId") AS "openwaSessionId"
     LIMIT $2`,
    [staleBefore, limit],
  );
  return rows.map((r) => ({
    jobId: r.id,
    tenantId: r.tenantId,
    deviceId: r.deviceId,
    deviceLabel: r.deviceLabel,
    openwaSessionId: r.openwaSessionId,
    chatId: r.chatId ?? "",
  }));
}

/** Job selesai → status sent + counter broadcast naik. */
export async function markBroadcastJobSent(jobId: string, messageId: string | null): Promise<void> {
  await query(
    `UPDATE "PlatformBroadcastJob" SET status = 'sent', "messageId" = $1,
            "sentAt" = now(), "lockedAt" = NULL, "updatedAt" = now() WHERE id = $2`,
    [messageId, jobId],
  );
  await bumpBroadcastCounters(jobId);
}

/** Job gagal → status failed (+ backoff retry otomatis bila attempts < 3). */
export async function markBroadcastJobFailed(
  jobId: string,
  error: string,
  retryAfterMs = 30_000,
): Promise<void> {
  const row = await query<{ attempts: number }>(
    `UPDATE "PlatformBroadcastJob" SET attempts = attempts + 1, error = $1,
            "lockedAt" = NULL, "updatedAt" = now()
     WHERE id = $2 RETURNING attempts`,
    [error, jobId],
  );
  const attempts = row[0]?.attempts ?? 1;
  if (attempts < 3) {
    // Kembalikan ke pending dengan backoff (belum menyerah).
    await query(
      `UPDATE "PlatformBroadcastJob" SET status = 'pending',
              "nextAttemptAt" = now() + ($1 * interval '1 millisecond') WHERE id = $2`,
      [retryAfterMs * attempts, jobId],
    );
  } else {
    await query(
      `UPDATE "PlatformBroadcastJob" SET status = 'failed',
              "nextAttemptAt" = NULL WHERE id = $1`,
      [jobId],
    );
    await bumpBroadcastCounters(jobId);
  }
}

/** Naikkan counter broadcast (failed/sent) dari broadcast milik job. */
async function bumpBroadcastCounters(jobId: string): Promise<void> {
  await query(
    `UPDATE "PlatformBroadcast" b
     SET "failedCount" = COALESCE((SELECT COUNT(*)::int FROM "PlatformBroadcastJob" j
                                   WHERE j."broadcastId" = b.id AND j.status = 'failed'), 0),
         "sentCount" = COALESCE((SELECT COUNT(*)::int FROM "PlatformBroadcastJob" j
                                 WHERE j."broadcastId" = b.id AND j.status = 'sent'), 0)
     FROM "PlatformBroadcastJob" j
     WHERE j.id = $1 AND j."broadcastId" = b.id`,
    [jobId],
  );
}
