// Riwayat pesan (MessageLog) — NEON ONLY (source of truth).
//
// Keputusan desain: tidak ada replika D1. Berbeda dari User/ApiKey/Device/
// Webhook yang punya jalur baca panas (auth per request, polling device,
// ingest), halaman riwayat pesan hanya diakses user saat membuka dashboard —
// bukan hot-path. Replika D1 malah membuat d1-resync worker memindai tabel
// yang terus tumbuh tiap 15 menit. Writes (1 insert per pesan masuk/keluar)
// dan reads (pagination dashboard) langsung ke Neon.
//
// Catatan retensi: MVP tanpa job pembersihan — tabel akan terus tumbuh sesuai
// volume pesan. Hapus data lama di luar fitur bila diperlukan.

import { query, queryOne } from "@/lib/db";
import { sleep } from "@/lib/delay";
import { uuidv7 } from "@/lib/uuidv7";

export type MessageDirection = "incoming" | "outgoing";

// Batas panjang isi pesan yang disimpan — jaga ukuran baris dan berat respons
// halaman daftar (20 baris/halaman). Sesuai limit text API (4.096 karakter).
const MAX_BODY_LENGTH = 4096;

export interface MessageLogInput {
  tenantId: string;
  deviceId?: string | null;
  deviceLabel?: string | null;
  direction: MessageDirection;
  chatId: string;
  body: string;
  type?: string | null;
  status?: string | null;
  messageId?: string | null;
  mediaUrl?: string | null;
  mimetype?: string | null;
  mediaKey?: string | null;
  triggeredAt?: Date | string | null;
  sentAt?: Date | string | null;
}

/** Catat satu pesan (masuk/keluar) — best-effort oleh pemanggil. */
export async function insertMessageLog(input: MessageLogInput): Promise<void> {
  await query(
    'INSERT INTO "MessageLog" (id, "tenantId", "deviceId", "deviceLabel", direction, "chatId", body, type, status, "messageId", "mediaUrl", mimetype, "mediaKey", "triggeredAt", "sentAt") ' +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
    [
      uuidv7(),
      input.tenantId,
      input.deviceId ?? null,
      input.deviceLabel ?? null,
      input.direction,
      input.chatId,
      input.body.slice(0, MAX_BODY_LENGTH),
      input.type ?? null,
      input.status ?? null,
      input.messageId ?? null,
      input.mediaUrl ?? null,
      input.mimetype ?? null,
      input.mediaKey ?? null,
      input.triggeredAt ? new Date(input.triggeredAt) : null,
      input.sentAt ? new Date(input.sentAt) : null,
    ],
  );
}

// ── Pelacakan status kirim (sent → delivered → read / failed) ──────────────
// OpenWA mengirim ack asinkron lewat webhook `message.ack` (status delivered/
// read) dan `message.failed` (status failed). Kita memajukan kolom
// MessageLog.status dengan guard FORWARD-ONLY agar ack yang datang terlambat/
// tak berurutan tidak menurunkan status (mis. delivered tiba setelah read).
// Status `sent`/`pending` dari ack diabaikan — pesan keluar sudah tercatat
// `sent` sejak dikirim (sendMessage.ts).

export type MessageDeliveryStatus = "delivered" | "read" | "failed";

/** Status ack OpenWA yang memajukan status tersimpan (sent/pending = no-op). */
export function isMessageDeliveryStatus(s: string): s is MessageDeliveryStatus {
  return s === "delivered" || s === "read" || s === "failed";
}

// Jeda reconcile — ack bisa tiba SEBELUM INSERT MessageLog (jalur kirim) commit;
// retry sekali setelah jeda singkat (pola OpenWA ACK_RECONCILE_DELAY_MS = 750).
export const ACK_RECONCILE_DELAY_MS = 750;

/**
 * Majukan status satu pesan keluar (dicari via messageId + tenantId) dengan
 * guard forward-only. Mengembalikan true bila ada baris yang berubah.
 * Guard: delivered ← sent · read ← sent/delivered · failed ← sent.
 */
export async function applyMessageDeliveryStatus(
  tenantId: string,
  messageId: string,
  status: MessageDeliveryStatus,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'UPDATE "MessageLog" SET status = $3 ' +
      'WHERE "tenantId" = $1 AND "messageId" = $2 AND (' +
      "($3 = 'delivered' AND status = 'sent') OR " +
      "($3 = 'read' AND status IN ('sent', 'delivered')) OR " +
      "($3 = 'failed' AND status = 'sent')) " +
      "RETURNING id",
    [tenantId, messageId, status],
  );
  return rows.length > 0;
}

/**
 * Update status kirim + reconcile SEKALI bila belum match (race ack vs insert
 * log kirim). Dipakai ingest webhook — best-effort oleh pemanggil.
 */
export async function updateMessageDeliveryStatus(
  tenantId: string,
  messageId: string,
  status: MessageDeliveryStatus,
): Promise<boolean> {
  if (await applyMessageDeliveryStatus(tenantId, messageId, status)) return true;
  await sleep(ACK_RECONCILE_DELAY_MS);
  return applyMessageDeliveryStatus(tenantId, messageId, status);
}

// ── Reaksi pesan (message.reaction) ─────────────────────────────────────────
// Kolom `reaction` = JSON map senderId → emoji (mis. {"62812@c.us":"👍"}).
// OpenWA mengirim event `message.reaction` dengan data { messageId, senderId,
// reaction ("" = hapus), reactions? (snapshot lengkap semua sender) }. Snapshot
// dipakai bila tersedia; selain itu merge satu sender (read-modify-write).

function parseReactionMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 0) out[k] = v;
      }
      return out;
    }
  } catch {
    /* korup → anggap kosong */
  }
  return {};
}

function serializeReactionMap(map: Record<string, string>): string | null {
  const keys = Object.keys(map);
  return keys.length === 0 ? null : JSON.stringify(map);
}

/** Tulis snapshot reaksi lengkap (atau NULL bila kosong). */
export async function setMessageReactions(
  tenantId: string,
  messageId: string,
  reactions: Record<string, string>,
): Promise<boolean> {
  const value = serializeReactionMap(reactions);
  const rows = await query<{ id: string }>(
    'UPDATE "MessageLog" SET reaction = $3 WHERE "tenantId" = $1 AND "messageId" = $2 RETURNING id',
    [tenantId, messageId, value],
  );
  return rows.length > 0;
}

/** Merge satu reaksi (read-modify-write) — reaction "" = hapus sender. */
export async function mergeMessageReaction(
  tenantId: string,
  messageId: string,
  senderId: string,
  reaction: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string; reaction: string | null }>(
    'SELECT id, reaction FROM "MessageLog" WHERE "tenantId" = $1 AND "messageId" = $2',
    [tenantId, messageId],
  );
  if (!row) return false;
  const map = parseReactionMap(row.reaction);
  if (reaction === "") delete map[senderId];
  else map[senderId] = reaction;
  await query('UPDATE "MessageLog" SET reaction = $2 WHERE id = $1', [row.id, serializeReactionMap(map)]);
  return true;
}

export interface MessageLogRow {
  id: string;
  tenantId: string;
  deviceId: string | null;
  deviceLabel: string | null;
  direction: string;
  chatId: string;
  body: string;
  type: string | null;
  status: string | null;
  messageId: string | null;
  mediaUrl: string | null;
  mimetype: string | null;
  mediaKey: string | null;
  reaction: string | null;
  triggeredAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface ListMessagesParams {
  tenantId: string;
  query?: string;
  direction?: string;
  page?: number;
  limit?: number;
}

const MESSAGE_COLUMNS = `id, "tenantId", "deviceId", "deviceLabel", direction, "chatId", body, type, status, "messageId", "mediaUrl", mimetype, "mediaKey", reaction, "triggeredAt", "sentAt", "createdAt"`;

/** Daftar riwayat pesan tenant — pencarian (body/chatId) + filter arah + pagination. */
export async function listMessagesPaginated(
  params: ListMessagesParams,
): Promise<{ messages: MessageLogRow[]; total: number }> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;

  const conditions: string[] = ['"tenantId" = $1'];
  const args: unknown[] = [params.tenantId];

  const q = (params.query ?? "").trim();
  if (q) {
    // Escape wildcard LIKE agar input user dicari literal, bukan pola SQL.
    // ESCAPE eksplisit: bound parameter tidak melewati literal parsing SQL,
    // sehingga backslash hanya dianggap "escape char" bila klausa ESCAPE
    // dinyatakan. Wildcard %/_ milik user di-escape agar dicari literal.
    const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
    const n = args.length + 1;
    conditions.push(`(body ILIKE $${n} ESCAPE '\\' OR "chatId" ILIKE $${n} ESCAPE '\\')`);
    args.push(`%${escaped}%`);
  }
  if (params.direction === "incoming" || params.direction === "outgoing") {
    const n = args.length + 1;
    conditions.push(`direction = $${n}`);
    args.push(params.direction);
  }

  const where = conditions.join(" AND ");
  const [countRows, rows] = await Promise.all([
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "MessageLog" WHERE ${where}`, args),
    query<MessageLogRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM "MessageLog" WHERE ${where} ` +
        `ORDER BY "createdAt" DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
  ]);

  return {
    messages: rows,
    total: Number(countRows[0]?.count ?? 0),
  };
}
