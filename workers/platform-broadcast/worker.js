// Platform broadcast dispatch worker (standalone, deploy terpisah, trigger
// HTTP manual ?token=BROADCAST_DISPATCH_TOKEN — mengikuti pola campaign-dispatch:
// tanpa cron agar Neon scale-to-zero).
//
// Tujuan: mengirim pengumuman platform ke nomor pemilik perangkat (job
// PlatformBroadcastJob, chatId dari Device.phone). Satu tick = satu batch kecil
// job pending milik broadcast berstatus running.
//
// Alur per tick:
//   1. Klaim batch job pending (atomic UPDATE … FROM broadcast running,
//      staleness recovery: lockedAt > 10 menit diklaim ulang).
//   2. Ambil messageBody broadcast per job.
//   3. Kirim text via OpenWA (send-text). Watermark footnote platform
//      disisipkan kecuali tenant punya addon remove_watermark (query per tenant
//      di-cache dalam satu tick).
//   4. Sukses → INSERT MessageLog tenant (outgoing, sent) + mark job sent.
//   5. Gagal → mark job failed (retry backoff; attempts 3 → failed final).
//   6. Finalisasi: tidak ada job pending/sending tersisa → broadcast completed
//      (atau failed bila semua gagal).
//
// Secret: DATABASE_URL, OPENWA_BASE_URL, OPENWA_ADMIN_KEY, BROADCAST_DISPATCH_TOKEN.
import { Client } from "@neondatabase/serverless";
import { postJson } from "../shared/http.js";

const BATCH_LIMIT = 10;
const SEND_TIMEOUT_MS = 30_000;
const JITTER_MAX_MS = 2_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function footnote(env) {
  const raw = String(env.PINTSEND_WATERMARK_FOOTNOTE ?? "").trim();
  return raw || "via PintaSend - https://pintasend.satupintudigital.co.id";
}

function withFootnote(text, foot) {
  if (!foot) return text;
  return `${text}\n\n${foot}`;
}

async function uuidv7() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number((BigInt(Math.floor(ms / 2 ** (8 * i))) % 256n));
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5",
  );
}

async function openwaSendText(env, sessionId, chatId, text) {
  const base = String(env.OPENWA_BASE_URL ?? "").replace(/\/$/, "");
  // Serialisasi body + header JSON via helper bersama workers/shared/http.js.
  const res = await postJson(
    `${base}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`,
    { chatId, text },
    {
      headers: { "X-API-Key": String(env.OPENWA_ADMIN_KEY ?? "") },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    let message = res.statusText;
    try {
      const textBody = await res.text();
      if (textBody) message = textBody.slice(0, 300);
    } catch { /* ignore */ }
    throw new Error(`OpenWA ${res.status}: ${message}`);
  }
  return res.json();
}

async function claimBatch(client) {
  // Klaim job pending dari broadcast running — atomic + staleness recovery.
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const claim = await client.query(
    `UPDATE "PlatformBroadcastJob" j
     SET "lockedAt" = now(), "updatedAt" = now()
     FROM "PlatformBroadcast" b
     WHERE j."broadcastId" = b.id
       AND j.status = 'pending'
       AND b.status = 'running'
       AND (j."nextAttemptAt" IS NULL OR j."nextAttemptAt" <= now())
       AND (j."lockedAt" IS NULL OR j."lockedAt" <= $1::timestamptz)
     RETURNING j.id, j."broadcastId", j."tenantId", j."deviceId", j."deviceLabel", j."chatId",
               (SELECT d."openwaSessionId" FROM "Device" d WHERE d.id = j."deviceId") AS "openwaSessionId"
     LIMIT $2`,
    [staleBefore, BATCH_LIMIT],
  );
  return claim.rows;
}

async function loadBodies(client, jobs) {
  const ids = [...new Set(jobs.map((j) => j.broadcastId))];
  const res = await client.query(
    `SELECT id, "messageBody" FROM "PlatformBroadcast" WHERE id = ANY($1::text[])`,
    [ids],
  );
  const map = {};
  for (const row of res.rows) map[row.id] = row.messageBody;
  return map;
}

async function loadNoWatermarkTenants(client, jobs) {
  const ids = [...new Set(jobs.map((j) => j.tenantId))];
  const res = await client.query(
    `SELECT "tenantId" FROM "TenantAddon"
     WHERE "tenantId" = ANY($1::text[]) AND key = 'remove_watermark' AND active`,
    [ids],
  );
  return new Set(res.rows.map((r) => r.tenantId));
}

async function finalizeBroadcast(client, broadcastId) {
  const remaining = await client.query(
    `SELECT COUNT(*)::int AS count FROM "PlatformBroadcastJob"
     WHERE "broadcastId" = $1 AND status IN ('pending','sending')`,
    [broadcastId],
  );
  if ((remaining.rows[0]?.count ?? 0) > 0) return null;

  const done = await client.query(
    `UPDATE "PlatformBroadcast" SET
       "sentCount" = (SELECT COUNT(*)::int FROM "PlatformBroadcastJob"
                      WHERE "broadcastId" = $1 AND status = 'sent'),
       "failedCount" = (SELECT COUNT(*)::int FROM "PlatformBroadcastJob"
                        WHERE "broadcastId" = $1 AND status = 'failed'),
       status = CASE WHEN (SELECT COUNT(*)::int FROM "PlatformBroadcastJob"
                           WHERE "broadcastId" = $1 AND status = 'sent') > 0
                     THEN 'completed' ELSE 'failed' END,
       "failReason" = CASE WHEN (SELECT COUNT(*)::int FROM "PlatformBroadcastJob"
                                 WHERE "broadcastId" = $1 AND status = 'sent') > 0
                           THEN NULL ELSE 'semua job gagal' END,
       "completedAt" = now(), "updatedAt" = now()
     WHERE id = $1 AND status = 'running'
     RETURNING id, status`,
    [broadcastId],
  );
  return done.rows[0] ?? null;
}

async function runDispatch(env) {
  const started = Date.now();
  const result = {
    ok: true, durationMs: 0, claimed: 0, sent: 0, failed: 0,
    completed: [], errors: [], reason: null,
  };

  const connectionString = String(env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    result.ok = false;
    result.errors.push("DATABASE_URL secret tidak tersedia");
    return result;
  }

  const client = new Client(connectionString);
  await client.connect();
  try {
    // 1. Klaim batch.
    const jobs = await claimBatch(client);
    result.claimed = jobs.length;
    if (jobs.length === 0) {
      result.reason = "tidak ada job broadcast pending";
      return result;
    }

    const bodies = await loadBodies(client, jobs);
    const noWatermark = await loadNoWatermarkTenants(client, jobs);
    const foot = footnote(env);

    // 2. Kirim satu-per-satu (jeda kecil antar pesan agar tidak terlihat spam).
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const body = bodies[job.broadcastId] ?? "";
      const applyFootnote = !noWatermark.has(job.tenantId);
      const text = applyFootnote ? withFootnote(body, foot) : body;
      try {
        const sendResult = await openwaSendText(env, job.openwaSessionId, job.chatId, text);
        const messageId = sendResult?.messageId ?? sendResult?.id ?? null;

        // 3a. MessageLog tenant (outgoing) — riwayat tenant konsisten dengan
        //     pesan keluar lain. watermark = footnote ikut disisipkan.
        await client.query(
          `INSERT INTO "MessageLog"
             (id, "tenantId", "deviceId", "deviceLabel", direction, "chatId", body,
              type, status, "messageId", "mediaUrl", mimetype, "mediaKey",
              "triggeredAt", "sentAt", watermark)
           VALUES ($1, $2, $3, $4, 'outgoing', $5, $6, 'text', 'sent', $7,
                   NULL, NULL, NULL, now(), now(), $8)`,
          [await uuidv7(), job.tenantId, job.deviceId, job.deviceLabel, job.chatId,
           text.slice(0, 4096), messageId, applyFootnote],
        );
        // 3b. Mark job sent + counter broadcast.
        await client.query(
          `UPDATE "PlatformBroadcastJob" SET status = 'sent', "messageId" = $2,
                  "sentAt" = now(), "lockedAt" = NULL, "updatedAt" = now()
           WHERE id = $1`,
          [job.id, messageId],
        );
        result.sent++;
      } catch (e) {
        console.error(`platform-broadcast: kirim gagal ${job.chatId}:`, e?.message ?? e);
        // 4. Mark failed (backoff retry; attempts 3 → failed final).
        const mark = await client.query(
          `UPDATE "PlatformBroadcastJob" SET attempts = attempts + 1, error = $1,
                  "lockedAt" = NULL, "updatedAt" = now()
           WHERE id = $2 RETURNING attempts`,
          [String(e?.message ?? e).slice(0, 300), job.id],
        );
        const attempts = Number(mark.rows[0]?.attempts ?? 1);
        if (attempts < 3) {
          await client.query(
            `UPDATE "PlatformBroadcastJob" SET status = 'pending',
                    "nextAttemptAt" = now() + ($1 * attempts * interval '1 millisecond')
             WHERE id = $2`,
            [30_000, job.id],
          );
        } else {
          await client.query(
            `UPDATE "PlatformBroadcastJob" SET status = 'failed',
                    "nextAttemptAt" = NULL, "updatedAt" = now() WHERE id = $1`,
            [job.id],
          );
        }
        result.failed++;
      }
      if (i < jobs.length - 1) await sleep(Math.min(500 + Math.random() * 1500, JITTER_MAX_MS));
    }

    // 5. Finalisasi tiap broadcast yang job-nya habis.
    const affected = [...new Set(jobs.map((j) => j.broadcastId))];
    for (const bId of affected) {
      const done = await finalizeBroadcast(client, bId);
      if (done) result.completed.push(done.id);
    }
  } catch (e) {
    result.ok = false;
    result.errors.push(String(e?.message ?? e));
    console.error("platform-broadcast: fatal", e);
  } finally {
    await client.end();
  }

  result.durationMs = Date.now() - started;
  return result;
}

const worker = {
  // Dispatcher on-demand agar tidak membangunkan Neon saat idle.
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
      }
      const url = new URL(request.url);
      const token = url.searchParams.get("token") ?? "";
      if (!env.BROADCAST_DISPATCH_TOKEN || token !== env.BROADCAST_DISPATCH_TOKEN) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const result = await runDispatch(env);
      return Response.json(result);
    } catch (e) {
      console.error("platform-broadcast: unexpected", e);
      return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
    }
  },
};

export default worker;
