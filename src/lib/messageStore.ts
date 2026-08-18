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

import { query } from "@/lib/db";
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

const MESSAGE_COLUMNS = `id, "tenantId", "deviceId", "deviceLabel", direction, "chatId", body, type, status, "messageId", "mediaUrl", mimetype, "mediaKey", "triggeredAt", "sentAt", "createdAt"`;

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
