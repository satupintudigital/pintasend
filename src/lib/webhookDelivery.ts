// Outbox pattern untuk delivery webhook ke client (pola sama dengan outbox
// akuntansi NalaNiaga — lihat NalaNiaga/docs/INTEGRASI.md §3).
//
// Masalah yang dipecahkan: ingest webhook OpenWA sebelumnya meneruskan event ke
// URL client SECARA SINKRON, sekali coba, timeout 5 dtk. Client lambat/down →
// event hilang (hanya log). Dengan outbox:
//   1. Ingest menulis baris `WebhookDelivery` (status pending) ke Neon — cepat,
//      tidak bergantung pada ketersediaan endpoint client.
//   2. Ingest mencoba deliver SEKALI (sinkron, timeout 5 dtk) — latency tetap
//      rendah untuk kasus normal.
//   3. Jika gagal → baris tetap pending dengan `nextAttemptAt` = backoff.
//   4. Worker HTTP on-demand (`workers/webhook-delivery`) mengambil batch pending yang
//      sudah waktunya, deliver ulang, update status. Setelah DELIVERY_MAX_ATTEMPTS
//      gagal → status `failed` (dead-letter, sengaja dipertahankan utk debugging).
//
// Backoff (konsisten akuntansi): attempt 1 immediate → +30s → +5min → dead-letter.

import { query } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";

export const DELIVERY_MAX_ATTEMPTS = 3;
export const DELIVERY_TIMEOUT_MS = 5_000;

// Delay sebelum attempt berikutnya, berdasar jumlah attempt yang SUDAH dilakukan.
//   0 (belum pernah) → immediate
//   1 (gagal 1×)     → +30 dtk
//   2 (gagal 2×)     → +5 menit
//   >= 3             → null (habis → dead-letter)
export function nextRetryDelayMs(afterAttempts: number): number | null {
  if (afterAttempts >= DELIVERY_MAX_ATTEMPTS) return null;
  if (afterAttempts === 0) return 0;
  if (afterAttempts === 1) return 30_000;
  return 300_000;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookDeliveryInput {
  tenantId: string;
  webhookId: string;
  event: string;
  /** Snapshot URL client — tidak berubah walau config webhook diubah nanti. */
  url: string;
  /** Envelope JSON yang akan dikirim (body mentah). */
  payload: string;
  /** x-wavio-signature yang sudah dihitung atas payload. */
  signature: string;
}

export interface WebhookDeliveryRow {
  id: string;
  tenantId: string;
  webhookId: string;
  event: string;
  url: string;
  payload: string;
  signature: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DELIVERY_COLUMNS = `id, "tenantId", "webhookId", event, url, payload, signature, status, attempts, "nextAttemptAt", "lastError", "lastAttemptAt", "createdAt", "updatedAt"`;

/** Enqueue delivery baru (status pending, nextAttemptAt = now → siap dicoba). */
export async function enqueueWebhookDelivery(input: WebhookDeliveryInput): Promise<string> {
  const id = uuidv7();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO "WebhookDelivery" (id, "tenantId", "webhookId", event, url, payload, signature, status, attempts, "nextAttemptAt", "createdAt", "updatedAt") ` +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0, now(), $8, $8)",
    [id, input.tenantId, input.webhookId, input.event, input.url, input.payload, input.signature, now],
  );
  return id;
}

export interface DeliveryAttempt {
  ok: boolean;
  status: number | null;
  error: string | null;
}

/** Deliver satu payload ke URL client — sinkron, timeout 5 dtk. */
export async function deliverWebhookOnce(
  url: string,
  body: string,
  signature: string,
  event: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryAttempt> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Wavio-Webhook/1.0",
        "x-wavio-signature": signature,
        "x-wavio-event": event,
        "x-wavio-delivery-at": new Date().toISOString(),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface MarkDeliveryInput {
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt?: Date | null;
  lastError?: string | null;
}

/** Update status baris delivery (dipakai setelah setiap attempt). */
export async function markWebhookDelivery(id: string, input: MarkDeliveryInput): Promise<void> {
  await query(
    `UPDATE "WebhookDelivery" SET status = $2, attempts = $3, "nextAttemptAt" = $4, "lastError" = $5, "lastAttemptAt" = now(), "updatedAt" = now() WHERE id = $1`,
    [id, input.status, input.attempts, input.nextAttemptAt ? input.nextAttemptAt.toISOString() : null, input.lastError ?? null],
  );
}

/** Ambil batch pending yang sudah waktunya — dipakai worker HTTP on-demand. */
export async function claimPendingDeliveries(limit = 10): Promise<WebhookDeliveryRow[]> {
  return query<WebhookDeliveryRow>(
    `SELECT ${DELIVERY_COLUMNS} FROM "WebhookDelivery" ` +
      "WHERE status = 'pending' AND (\"nextAttemptAt\" IS NULL OR \"nextAttemptAt\" <= now()) " +
      "ORDER BY \"nextAttemptAt\" ASC NULLS FIRST LIMIT $1",
    [limit],
  );
}

/** Saat webhook tenant dihapus → batalkan delivery pending (jangan kirim ke URL lama). */
export async function cancelPendingDeliveriesForTenant(tenantId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    'UPDATE "WebhookDelivery" SET status = \'failed\', "lastError" = \'webhook config dihapus\', "updatedAt" = now() ' +
      'WHERE "tenantId" = $1 AND status = \'pending\' RETURNING id',
    [tenantId],
  );
  return rows.length;
}
