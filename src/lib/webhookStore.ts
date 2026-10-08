// Konfigurasi webhook per tenant — satu baris per tenant.
// Write-through: Neon source of truth → clone D1 (replika baca cepat, 0 Neon).
// Jalur baca (dashboard + ingest) memakai D1, sama seperti authStore.

import { query } from "@/lib/db";
import { queryD1, queryD1One } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";
import { OPENWA_WEBHOOK_EVENTS } from "@/lib/openwa";
import type { WebhookFilters } from "@/lib/webhookFilters";

export const WEBHOOK_EVENT_LIST: string[] = [...OPENWA_WEBHOOK_EVENTS, "campaign.completed"];

export interface WebhookConfig {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  /** Event yang diteruskan ke client (subset dari WEBHOOK_EVENT_LIST). */
  events: string[];
  /** Smart filters opsional — null/empty = semua event lolos. */
  filters: WebhookFilters | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WebhookRowD1 {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  events: string;
  filters: string;
  active: number;
  createdAt: string;
  updatedAt: string;
}

function parseEvents(raw: string): string[] {
  try {
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function parseFilters(raw: string): WebhookFilters | null {
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const conditions = (obj as Record<string, unknown>).conditions;
      if (Array.isArray(conditions)) {
        return { conditions } as WebhookFilters;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function fromD1(row: WebhookRowD1): WebhookConfig {
  return {
    id: row.id,
    tenantId: row.tenantId,
    url: row.url,
    secret: row.secret,
    events: parseEvents(row.events),
    filters: parseFilters(row.filters),
    active: row.active === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Secret delivery random (32 byte hex) — dipakai jika client tidak menyediakan. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Simpan/update konfigurasi webhook tenant (write-through Neon → D1). */
export async function upsertWebhook(input: {
  tenantId: string;
  url: string;
  secret: string;
  events: string[];
  filters?: WebhookFilters | null;
  active?: boolean;
}): Promise<{ id: string }> {
  const id = uuidv7();
  const now = new Date().toISOString();
  const active = input.active ?? true;
  const eventsJson = JSON.stringify(input.events);
  const filtersJson = JSON.stringify(input.filters ?? { conditions: [] });

  // ON CONFLICT (tenantId) → satu baris per tenant, race-free.
  const rows = await query<{ id: string }>(
    'INSERT INTO "Webhook" (id, "tenantId", url, secret, events, filters, active, "createdAt", "updatedAt") ' +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
      'ON CONFLICT ("tenantId") DO UPDATE SET url = EXCLUDED.url, secret = EXCLUDED.secret, ' +
      "events = EXCLUDED.events, filters = EXCLUDED.filters, active = EXCLUDED.active, \"updatedAt\" = EXCLUDED.\"updatedAt\" " +
      "RETURNING id",
    [id, input.tenantId, input.url, input.secret, eventsJson, filtersJson, active, now, now],
  );

  // Clone ke D1.
  try {
    await queryD1(
      "INSERT OR REPLACE INTO Webhook (id, tenantId, url, secret, events, filters, active, createdAt, updatedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [rows[0].id, input.tenantId, input.url, input.secret, eventsJson, filtersJson, active ? 1 : 0, now, now],
    );
  } catch (e) {
    console.error("webhookStore: clone D1 gagal, D1 stale:", e);
  }
  return { id: rows[0].id };
}

/** Baca konfigurasi webhook tenant — baca D1 (0 koneksi Neon). */
export async function getWebhookForTenant(tenantId: string): Promise<WebhookConfig | null> {
  const row = await queryD1One<WebhookRowD1>(
    "SELECT id, tenantId, url, secret, events, filters, active, createdAt, updatedAt " +
      "FROM Webhook WHERE tenantId = ?",
    [tenantId],
  );
  return row ? fromD1(row) : null;
}

/** Hapus konfigurasi webhook tenant (write-through Neon → D1). */
export async function deleteWebhookForTenant(tenantId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM "Webhook" WHERE "tenantId" = $1 RETURNING id',
    [tenantId],
  );
  if (rows.length === 0) return false;
  try {
    await queryD1("DELETE FROM Webhook WHERE tenantId = ?", [tenantId]);
  } catch (e) {
    console.error("webhookStore: delete D1 gagal, D1 stale:", e);
  }
  return true;
}
