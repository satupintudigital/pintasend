// Kontak audiens campaign — tabel Contact, NEON ONLY (pola sama messageStore).
//
// Bukan hot-path: ditulis saat import/CRUD manual di dashboard/API, dibaca saat
// membuat campaign & oleh dispatcher worker. Tidak ada replika D1.
//
// Import CSV: parser RFC4180 ringkas (quote, escape "", koma di dalam kutip).
// Header kolom fleksibel — phone/nomor/no/wa → chatId, name/nama → nama,
// tags/tag → tag (dipisah ; atau |). Dedup via UNIQUE(tenantId, chatId) —
// baris duplikat meng-UPDATE nama/tag (upsert), bukan error.

import { query } from "@/lib/db";
import { normalizeChatId } from "./chat";
import { uuidv7 } from "./uuidv7";

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_CONTACT_NAME_LENGTH = 100;
export const MAX_TAGS_PER_CONTACT = 10;

export interface ParsedContactRow {
  chatId: string;
  name: string | null;
  tags: string[];
}

export type CsvParseResult =
  | { ok: true; rows: ParsedContactRow[] }
  | { ok: false; error: string };

/** Pecah satu baris CSV menghormati tanda kutip ganda (RFC4180 ringkas). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const PHONE_ALIASES = ["phone", "nomor", "no", "wa", "whatsapp", "notelp", "notelepon", "msisdn"];
const NAME_ALIASES = ["name", "nama"];
const TAGS_ALIASES = ["tags", "tag"];

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h.toLowerCase().replace(/[\s_-]/g, "")));
}

/**
 * Parse isi file CSV → baris kontak ternormalisasi. Pure — di-unit-test.
 * Baris dengan nomor tidak valid DILEWATI (bukan gagal total) dan dihitung.
 */
export function parseContactsCsv(text: string): CsvParseResult & { skipped?: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, error: "CSV harus berisi header + minimal 1 baris data" };

  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, ""));
  const phoneIdx = findColumn(header, PHONE_ALIASES);
  const nameIdx = findColumn(header, NAME_ALIASES);
  const tagsIdx = findColumn(header, TAGS_ALIASES);
  if (phoneIdx === -1) {
    return { ok: false, error: 'Kolom nomor tidak ditemukan. Gunakan header "nomor" atau "phone"' };
  }

  const rows: ParsedContactRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1, MAX_IMPORT_ROWS + 1)) {
    const cells = splitCsvLine(line);
    const chatId = normalizeChatId(cells[phoneIdx] ?? "");
    if (!chatId || /^\d+@(g\.us|lid)$/i.test(chatId)) {
      // JID grup bukan audiens contact personal — lewati.
      skipped++;
      continue;
    }
    const rawName = nameIdx >= 0 ? (cells[nameIdx] ?? "").trim() : "";
    const name = rawName ? rawName.slice(0, MAX_CONTACT_NAME_LENGTH) : null;
    const rawTags = tagsIdx >= 0 ? (cells[tagsIdx] ?? "").trim() : "";
    const tags = rawTags
      ? rawTags
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, MAX_TAGS_PER_CONTACT)
      : [];
    rows.push({ chatId, name, tags });
  }
  if (rows.length === 0) {
    return { ok: false, error: "Tidak ada baris valid — pastikan kolom nomor berisi nomor WhatsApp" };
  }
  return { ok: true, rows, skipped };
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/** Upsert batch kontak — duplikat chatId meng-update nama/tag (bukan error). */
export async function importContacts(
  tenantId: string,
  rows: ParsedContactRow[],
): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;
  // Chunk 200 baris/statement — jaga ukuran query tetap wajar.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((r) => {
      const base = values.length;
      values.push(uuidv7(), tenantId, r.chatId, r.name, JSON.stringify(r.tags));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });
    const res = await query<{ id: string; inserted: boolean }>(
      `INSERT INTO "Contact" (id, "tenantId", "chatId", "name", tags) VALUES ${tuples.join(", ")} ` +
        'ON CONFLICT ("tenantId", "chatId") DO UPDATE SET "name" = EXCLUDED."name", tags = EXCLUDED.tags, "updatedAt" = now() ' +
        "RETURNING (xmax = 0) AS inserted",
      values,
    );
    for (const row of res) {
      if (row.inserted) inserted++;
      else updated++;
    }
  }
  return { inserted, updated, skipped: 0 };
}

export interface ContactRow {
  id: string;
  chatId: string;
  name: string | null;
  tags: string;
  optedOut: boolean;
  notes: string | null;
  createdAt: string;
}

export interface ContactListParams {
  q?: string;
  tag?: string;
  optedOut?: boolean;
  page?: number;
  limit?: number;
}

/** Daftar kontak tenant + total — pagination untuk halaman dashboard. */
export async function listContacts(
  tenantId: string,
  params: ContactListParams = {},
): Promise<{ contacts: ContactRow[]; total: number }> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const offset = limit * (page - 1);

  const where: string[] = ['"tenantId" = $1'];
  const args: unknown[] = [tenantId];
  if (params.q?.trim()) {
    args.push(`%${params.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where.push(`("chatId" ILIKE $${args.length} OR COALESCE("name", '') ILIKE $${args.length})`);
  }
  if (params.tag?.trim()) {
    args.push(`%"${params.tag.trim().replace(/["\\]/g, "")}"%`);
    where.push(`tags ILIKE $${args.length}`);
  }
  if (params.optedOut !== undefined) {
    args.push(params.optedOut);
    where.push(`"optedOut" = $${args.length}`);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [countRows, rows] = await Promise.all([
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "Contact" ${whereSql}`, args),
    query<ContactRow>(
      `SELECT id, "chatId", "name", tags, "optedOut", notes, "createdAt" FROM "Contact" ${whereSql} ` +
        `ORDER BY "createdAt" DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
  ]);
  return { contacts: rows, total: Number(countRows[0]?.count ?? 0) };
}

export interface UpsertContactInput {
  chatId: string;
  name?: string | null;
  tags?: string[];
  optedOut?: boolean;
  notes?: string | null;
}

/** Tambah/sunting satu kontak (dashboard & API). Return id. */
export async function upsertContact(tenantId: string, input: UpsertContactInput): Promise<string> {
  const id = uuidv7();
  const rows = await query<{ id: string }>(
    `INSERT INTO "Contact" (id, "tenantId", "chatId", "name", tags, "optedOut", notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ("tenantId", "chatId") DO UPDATE SET
       "name" = COALESCE(EXCLUDED."name", "Contact"."name"),
       tags = CASE WHEN EXCLUDED.tags <> '[]' THEN EXCLUDED.tags ELSE "Contact".tags END,
       "optedOut" = EXCLUDED."optedOut",
       notes = COALESCE(EXCLUDED.notes, "Contact".notes),
       "updatedAt" = now()
     RETURNING id`,
    [
      id,
      tenantId,
      input.chatId,
      input.name ?? null,
      JSON.stringify(input.tags ?? []),
      input.optedOut ?? false,
      input.notes ?? null,
    ],
  );
  return rows[0]?.id ?? "";
}

export async function setContactOptedOut(tenantId: string, contactId: string, optedOut: boolean): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'UPDATE "Contact" SET "optedOut" = $3, "updatedAt" = now() WHERE id = $2 AND "tenantId" = $1 RETURNING id',
    [tenantId, contactId, optedOut],
  );
  return rows.length > 0;
}

export interface ContactPatch {
  name?: string | null;
  tags?: string[];
  optedOut?: boolean;
  notes?: string | null;
}

/** Sunting kontak by id (PATCH /v1/contacts/:id). Hanya field terisi yang berubah. */
export async function patchContact(
  tenantId: string,
  contactId: string,
  patch: ContactPatch,
): Promise<boolean> {
  const sets: string[] = ['"updatedAt" = now()'];
  const args: unknown[] = [contactId, tenantId];
  if (patch.name !== undefined) {
    args.push(patch.name?.trim().slice(0, MAX_CONTACT_NAME_LENGTH) || null);
    sets.push(`"name" = $${args.length}`);
  }
  if (patch.tags !== undefined) {
    args.push(JSON.stringify(patch.tags.slice(0, MAX_TAGS_PER_CONTACT)));
    sets.push(`tags = $${args.length}`);
  }
  if (patch.optedOut !== undefined) {
    args.push(patch.optedOut);
    sets.push(`"optedOut" = $${args.length}`);
  }
  if (patch.notes !== undefined) {
    args.push(patch.notes?.slice(0, 500) ?? null);
    sets.push(`notes = $${args.length}`);
  }
  const rows = await query<{ id: string }>(
    `UPDATE "Contact" SET ${sets.join(", ")} WHERE id = $1 AND "tenantId" = $2 RETURNING id`,
    args,
  );
  return rows.length > 0;
}

export async function deleteContact(tenantId: string, contactId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM "Contact" WHERE id = $2 AND "tenantId" = $1 RETURNING id',
    [tenantId, contactId],
  );
  return rows.length > 0;
}
