// Webhook delivery worker (pola workers/d1-resync: standalone, deploy terpisah).
//
// Tujuan: menuntaskan retry delivery webhook ke client setelah attempt pertama
// di ingest (src/app/api/webhooks/openwa/route.ts) gagal. Backoff & status
// konsisten dengan src/lib/webhookDelivery.ts:
//   attempt 1 (immediate, di ingest) → +30s → +5min → failed (dead-letter).
//
// Alur per tick:
//   1. Claim batch pending (status='pending' AND nextAttemptAt <= now) LIMIT 10.
//   2. Deliver tiap baris (POST, timeout 5 dtk, header x-wavio-signature).
//   3. Sukses → status='delivered'. Gagal → attempts+1; jika attempts >= 3 →
//      status='failed' (dead-letter, baris dipertahankan utk debugging);
//      else nextAttemptAt = now + backoff(attempts baru).
//   4. Satu baris error tidak menghentikan batch (per-baris try/catch).
//
// Trigger:
//   - Cron (wrangler.jsonc triggers.crons) — otomatis tiap menit.
//   - HTTP POST manual: ?token=<DELIVERY_TOKEN> (on-demand / testing).
//
// Secret: DATABASE_URL (Neon), DELIVERY_TOKEN (proteksi trigger manual).
import { Client } from "@neondatabase/serverless";

const MAX_ATTEMPTS = 3;
const BATCH_LIMIT = 10;
const TIMEOUT_MS = 5_000;
const BACKOFF_AFTER_ATTEMPT_MS = [30_000, 300_000]; // setelah attempt 1 → 30s; attempt 2 → 5m

function backoffMs(afterAttempts) {
  if (afterAttempts >= MAX_ATTEMPTS) return null; // habis → dead-letter
  if (afterAttempts <= 0) return 0;
  return BACKOFF_AFTER_ATTEMPT_MS[Math.min(afterAttempts, BACKOFF_AFTER_ATTEMPT_MS.length) - 1] ?? 300_000;
}

async function deliverOnce(url, body, signature, event) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Wavio-Webhook/1.0",
        "x-wavio-signature": signature,
        "x-wavio-event": event,
        "x-wavio-delivery-at": new Date().toISOString(),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, error: e?.message ?? String(e) };
  }
}

const worker = {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runDelivery(env));
  },

  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
      }
      const url = new URL(request.url);
      const token = url.searchParams.get("token") ?? "";
      if (!env.DELIVERY_TOKEN || token !== env.DELIVERY_TOKEN) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const result = await runDelivery(env);
      return Response.json(result);
    } catch (e) {
      console.error("webhook-delivery: unexpected", e);
      return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
    }
  },
};

export default worker;

async function runDelivery(env) {
  const started = Date.now();
  const stats = { ok: true, durationMs: 0, finishedAt: null, claimed: 0, delivered: 0, failed: 0, deadLettered: 0, errors: [] };

  const connectionString = String(env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    stats.ok = false;
    stats.errors.push("DATABASE_URL secret tidak tersedia");
    return stats;
  }

  const client = new Client(connectionString);
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, "tenantId", event, url, payload, signature, attempts
       FROM "WebhookDelivery"
       WHERE status = 'pending' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
       ORDER BY "nextAttemptAt" ASC NULLS FIRST
       LIMIT $1`,
      [BATCH_LIMIT],
    );
    stats.claimed = rows.length;

    for (const row of rows) {
      try {
        const attempt = await deliverOnce(row.url, row.payload, row.signature, row.event);
        if (attempt.ok) {
          await client.query(
            `UPDATE "WebhookDelivery" SET status = 'delivered', attempts = attempts + 1,
               "lastAttemptAt" = now(), "lastError" = NULL, "updatedAt" = now() WHERE id = $1`,
            [row.id],
          );
          stats.delivered++;
          continue;
        }

        const nextAttempts = Number(row.attempts ?? 0) + 1;
        const delayMs = backoffMs(nextAttempts);
        if (delayMs === null) {
          // Dead-letter: attempt terakhir gagal — baris dipertahankan utk debugging.
          await client.query(
            `UPDATE "WebhookDelivery" SET status = 'failed', attempts = $2,
               "lastAttemptAt" = now(), "lastError" = $3, "updatedAt" = now() WHERE id = $1`,
            [row.id, nextAttempts, attempt.error],
          );
          stats.deadLettered++;
          console.error(`webhook-delivery: dead-letter ${row.id} (${row.event}): ${attempt.error}`);
        } else {
          await client.query(
            `UPDATE "WebhookDelivery" SET status = 'pending', attempts = $2,
               "nextAttemptAt" = now() + ($3 * interval '1 millisecond'),
               "lastAttemptAt" = now(), "lastError" = $4, "updatedAt" = now() WHERE id = $1`,
            [row.id, nextAttempts, delayMs, attempt.error],
          );
          stats.failed++;
        }
      } catch (e) {
        stats.ok = false;
        stats.errors.push(`deliver ${row.id}: ${e?.message ?? String(e)}`);
      }
    }
  } finally {
    await client.end();
  }

  stats.durationMs = Date.now() - started;
  stats.finishedAt = new Date().toISOString();
  return stats;
}
