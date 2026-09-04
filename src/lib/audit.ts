// ─── Audit log (Neon only, platform/tenant admin) ───────────────────────────
// Mencatat aksi admin & mutasi kunci dengan actor, tenant, action, meta JSON,
// dan IP. recordAudit NEVER-THROW: kegagalan menulis audit tidak boleh
// menggagalkan operasi utama (pola sama dengan webhook log di ingest).
//
// Hanya Neon (query via src/lib/db) — jalur admin frekuensi rendah; tidak ada
// replika D1. query() dengan RETURNING id untuk deteksi + konsistensi.

import { query } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";

export interface AuditActor {
  id?: string | null;
  email: string;
  role: string;
}

export interface AuditEntryInput {
  /** null = aksi platform-wide (tanpa tenant). */
  tenantId?: string | null;
  actor: AuditActor;
  /** action snake_case, lihat daftar di instrumentasi route (Task 7). */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditLogRow {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: string;
  ip: string | null;
  createdAt: string;
}

export interface AuditQuery {
  action?: string;
  tenantId?: string;
  actorEmail?: string;
  from?: string; // ISO date
  to?: string;
  q?: string; // LIKE pada action/targetId/meta (nilai pencarian longgar)
  page?: number;
  limit?: number;
}

// Never-throw: dipanggil await di akhir operasi sukses; error ditangkap &
// di-log saja — audit tidak boleh mematahkan alur utama.
export async function recordAudit(input: AuditEntryInput): Promise<void> {
  try {
    const meta = JSON.stringify(input.meta ?? {});
    await query(
      `INSERT INTO "AuditLog"
         (id, "tenantId", "actorUserId", "actorEmail", "actorRole", action,
          "targetType", "targetId", meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv7(),
        input.tenantId ?? null,
        input.actor.id ?? null,
        input.actor.email,
        input.actor.role,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        meta,
        input.ip ?? null,
      ],
    );
  } catch (e) {
    console.error("audit: record gagal (diabaikan):", e);
  }
}

function escapeLike(v: string): string {
  return v.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export async function listAuditLogs(
  params: AuditQuery = {},
): Promise<{ logs: AuditLogRow[]; total: number }> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const args: unknown[] = [];

  if (params.action) {
    clauses.push("action = $" + (args.length + 1));
    args.push(params.action);
  }
  if (params.tenantId) {
    clauses.push('"tenantId" = $' + (args.length + 1));
    args.push(params.tenantId);
  }
  if (params.actorEmail) {
    clauses.push('"actorEmail" = $' + (args.length + 1));
    args.push(params.actorEmail);
  }
  if (params.from) {
    clauses.push('"createdAt" >= $' + (args.length + 1));
    args.push(params.from);
  }
  if (params.to) {
    clauses.push('"createdAt" <= $' + (args.length + 1));
    args.push(params.to);
  }
  if (params.q) {
    const like = `%${escapeLike(params.q.trim())}%`;
    clauses.push(`(action ILIKE $${args.length + 1} OR "targetId" ILIKE $${args.length + 2} OR meta ILIKE $${args.length + 3})`);
    args.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [countRows, logRows] = await Promise.all([
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "AuditLog" ${where}`, args),
    query<AuditLogRow>(
      `SELECT id, "tenantId", "actorUserId", "actorEmail", "actorRole", action,
              "targetType", "targetId", meta, ip, "createdAt"
       FROM "AuditLog" ${where} ORDER BY "createdAt" DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
  ]);

  return { logs: logRows, total: Number(countRows[0]?.count ?? 0) };
}

// CSV row escape (koma, quote, newline) — helper pure, ter-test.
export function csvEscape(value: string | null | undefined): string {
  const s = (value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const AUDIT_CSV_HEADER =
  "waktu,actorEmail,actorRole,action,targetType,targetId,tenantId,meta,ip";

/** Serialisasi baris audit → CSV string (helper pure). */
export function auditRowToCsv(row: AuditLogRow): string {
  return [
    csvEscape(row.createdAt),
    csvEscape(row.actorEmail),
    csvEscape(row.actorRole),
    csvEscape(row.action),
    csvEscape(row.targetType),
    csvEscape(row.targetId),
    csvEscape(row.tenantId),
    csvEscape(row.meta),
    csvEscape(row.ip),
  ].join(",");
}
