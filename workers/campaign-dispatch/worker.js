// Campaign dispatch worker (standalone, deploy terpisah, trigger HTTP
// manual ?token=DISPATCH_TOKEN). Sengaja tidak memakai cron agar Neon scale-to-zero.
//
// Tujuan: mengeksekusi campaign blast massal TANPA menyentuh batas eksekusi
// request Workers utama. Satu tick = satu batch kecil dari SATU campaign
// tertua yang berjalan — pengiriman berjeda acak (anti-ban), status per
// penerima ditulis segera setelah tiap kirim.
//
// Alur per tick:
//   1. Claim campaign tertua: status IN ('running','scheduled') DAN
//      ("scheduledAt" IS NULL OR "scheduledAt" <= now()). 'scheduled' yang
//      jatuh tempo dipromosikan → 'running' (+startedAt).
//   2. Guard device: harus ada & ready & tanpa restriction — else campaign
//      di-pause dengan failReason.
//   3. Guard kuota bulanan tenant (Plan.maxMessagesPerMonth): habis → sisa
//      pending di-skip ('kuota habis') lalu difinalkan.
//   4. Guard cap harian per device (CAMPAIGN_DAILY_CAP) — hitung CampaignRecipient
//      terkirim hari ini (WIB) untuk device yang sama; tercapai → tick skip.
//   5. Claim batch pending (atomic UPDATE … FOR UPDATE SKIP LOCKED LIMIT N).
//   6. Kirim satu-per-satu via OpenWA (send-text/send-media) dengan jeda acak
//      [minDelaySec..maxDelaySec] antar pesan; watermark footnote platform
//      disisipkan kecuali tenant punya addon remove_watermark.
//   7. Finalisasi: refresh counter; tak ada pending tersisa → completed +
//      enqueue event webhook 'campaign.completed' ke outbox WebhookDelivery
//      (retry oleh workers/webhook-delivery).
//
// Secret: DATABASE_URL, OPENWA_BASE_URL, OPENWA_ADMIN_KEY, DISPATCH_TOKEN,
//         WAVIO_WATERMARK_FOOTNOTE (opsional).
import { Client } from "@neondatabase/serverless";
import { postJson, getJson } from "../shared/http.js";

// Free plan: invocation HTTP dibatasi ±30 dtk wall-clock & limits.* tidak
// didukung — BATCH_LIMIT + MAX_GAP_MS dijaga agar worst-case tick muat
// (4 kirim × ~1 dtk + 3 gap × ≤6 dtk ≈ <25 dtk). Throughput 240 pesan/jam/device.
const BATCH_LIMIT = 4;
const CAMPAIGN_DAILY_CAP = 250;
const SEND_TIMEOUT_MS = 30_000;
const MAX_GAP_MS = 6_000;

function jitterMs(campaign) {
  const min = Math.max(3, Number(campaign.minDelaySec ?? 5));
  const max = Math.max(min, Number(campaign.maxDelaySec ?? 15));
  const jitter = (min + Math.floor(Math.random() * (max - min + 1))) * 1000;
  return Math.min(jitter, MAX_GAP_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Substitusi {{var}} — konsisten dgn renderCampaignTemplate (src/lib/campaigns.ts). */
function renderTemplate(body, vars) {
  return body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

function footnote(env) {
  const raw = String(env.WAVIO_WATERMARK_FOOTNOTE ?? "").trim();
  return raw || "via Wavio - https://wavio.satupintudigital.co.id";
}

function withFootnote(text, foot) {
  if (!foot) return text;
  return `${text}\n\n${foot}`;
}

async function hmacSha256Hex(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function openwaSend(env, sessionId, action, payload) {
  const base = String(env.OPENWA_BASE_URL ?? "").replace(/\/$/, "");
  // Serialisasi body + header JSON ditangani helper bersama workers/shared/http.js.
  const res = await postJson(
    `${base}/api/sessions/${encodeURIComponent(sessionId)}/messages/${action}`,
    payload,
    {
      headers: { "X-API-Key": String(env.OPENWA_ADMIN_KEY ?? "") },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      if (text) message = text.slice(0, 300);
    } catch { /* ignore */ }
    throw new Error(`OpenWA ${res.status}: ${message}`);
  }
  return res.json();
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

async function enqueueCampaignCompleted(client, env, campaign, stats) {
  // Event hanya utk webhook tenant yang aktif dan subscribe 'campaign.completed'.
  const webhooks = await client.query(
    `SELECT id, url, secret, events FROM "Webhook" WHERE "tenantId" = $1 AND active = true`,
    [campaign.tenantId],
  );
  for (const wh of webhooks.rows) {
    let events = [];
    try { events = JSON.parse(wh.events ?? "[]"); } catch { /* ignore */ }
    if (!events.includes("campaign.completed")) continue;

    const envelope = JSON.stringify({
      event: "campaign.completed",
      deviceId: campaign.deviceId,
      sessionId: null,
      tenantId: campaign.tenantId,
      timestamp: Date.now(),
      data: {
        campaignId: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        sentCount: stats.sentCount,
        failedCount: stats.failedCount,
        skippedCount: stats.skippedCount,
        completedAt: new Date().toISOString(),
      },
    });
    const signature = `sha256=${await hmacSha256Hex(wh.secret, envelope)}`;
    await client.query(
      `INSERT INTO "WebhookDelivery" (id, "tenantId", "webhookId", event, url, payload, signature, status, attempts, "nextAttemptAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'campaign.completed', $4, $5, $6, 'pending', 0, now(), now(), now())`,
      [await uuidv7(), campaign.tenantId, wh.id, wh.url, envelope, signature],
    );
  }
}

async function finalizeCampaign(client, env, campaignId) {
  await client.query(
    `UPDATE "Campaign" SET
       "sentCount" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1 AND status = 'sent'),
       "failedCount" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1 AND status = 'failed'),
       "skippedCount" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1 AND status = 'skipped'),
       "updatedAt" = now()
     WHERE id = $1`,
    [campaignId],
  );
  const remaining = await client.query(
    `SELECT COUNT(*)::int AS count FROM "CampaignRecipient"
     WHERE "campaignId" = $1 AND status IN ('pending','sending')`,
    [campaignId],
  );
  if ((remaining.rows[0]?.count ?? 0) > 0) return null; // masih ada antrian

  const updated = await client.query(
    `UPDATE "Campaign" SET status = CASE WHEN "sentCount" > 0 THEN 'completed' ELSE 'failed' END,
       "completedAt" = now(), "updatedAt" = now()
     WHERE id = $1 AND status IN ('running','paused')
     RETURNING id, "tenantId", "deviceId", name, status, "totalRecipients", "sentCount", "failedCount", "skippedCount"`,
    [campaignId],
  );
  return updated.rows[0] ?? null;
}

async function runDispatch(env) {
  const started = Date.now();
  const result = {
    ok: true, durationMs: 0, campaignId: null, claimed: 0,
    sent: 0, failed: 0, skipped: 0, completed: false, reason: null, errors: [],
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
    // 1. Claim campaign tertua yang siap jalan.
    const campaigns = await client.query(
      `SELECT id, "tenantId", "deviceId", name, status, "messageBody", "mediaType", "mediaUrl",
              filename, "minDelaySec", "maxDelaySec", "totalRecipients"
       FROM "Campaign"
       WHERE status IN ('running','scheduled') AND ("scheduledAt" IS NULL OR "scheduledAt" <= now())
       ORDER BY "createdAt" ASC
       LIMIT 1`,
    );
    const campaign = campaigns.rows[0];
    if (!campaign) {
      result.reason = "tidak ada campaign siap";
      return result;
    }
    result.campaignId = campaign.id;

    if (campaign.status === "scheduled") {
      await client.query(
        `UPDATE "Campaign" SET status = 'running', "startedAt" = now(), "updatedAt" = now() WHERE id = $1`,
        [campaign.id],
      );
      campaign.status = "running";
    }

    // 2. Guard device.
    const devices = await client.query(
      `SELECT id, label, "openwaSessionId", status, restriction FROM "Device" WHERE id = $1`,
      [campaign.deviceId],
    );
    const device = devices.rows[0];
    if (!device || device.status !== "ready" || device.restriction) {
      await client.query(
        `UPDATE "Campaign" SET status = 'paused', "failReason" = $2, "updatedAt" = now() WHERE id = $1`,
        [campaign.id, !device ? "device tidak ditemukan" : device.restriction ? "device dibatasi WhatsApp" : `device tidak ready (${device.status})`],
      );
      result.reason = "device tidak siap — campaign dijeda";
      return result;
    }

    // 2b. Guard status sesi OpenWA langsung (Device.status di DB bisa basi bila
    //     webhook session.status tidak masuk) — sesi tidak ready → pause, jangan
    //     membakar penerima dgn error berulang.
    const sess = await getJson(
      `${String(env.OPENWA_BASE_URL ?? "").replace(/\/$/, "")}/api/sessions/${encodeURIComponent(device.openwaSessionId)}`,
      { headers: { "X-API-Key": String(env.OPENWA_ADMIN_KEY ?? "") }, signal: AbortSignal.timeout(10_000) },
    ).catch(() => null);
    if (!sess || !sess.ok) {
      await client.query(
        `UPDATE "Campaign" SET status = 'paused', "failReason" = $2, "updatedAt" = now() WHERE id = $1`,
        [campaign.id, "sesi gateway tidak dapat diverifikasi"],
      );
      result.reason = "gateway tidak merespons — campaign dijeda";
      return result;
    }
    const sessData = await sess.json().catch(() => null);
    if (sessData?.status !== "ready") {
      await client.query(
        `UPDATE "Campaign" SET status = 'paused', "failReason" = $2, "updatedAt" = now() WHERE id = $1`,
        [campaign.id, `sesi gateway tidak ready (status: ${sessData?.status ?? "?"})`],
      );
      result.reason = `sesi tidak ready (${sessData?.status ?? "?"}) — campaign dijeda`;
      return result;
    }

    // 3. Guard kuota bulanan (WIB) per tenant.
    const quotaRows = await client.query(
      `SELECT p."maxMessagesPerMonth" AS max,
              (SELECT COUNT(*)::int FROM "MessageLog" m
                WHERE m."tenantId" = $1
                  AND m."createdAt" >= date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta'))
               AS used
       FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
       WHERE t.id = $1`,
      [campaign.tenantId],
    );
    const maxMsg = quotaRows.rows[0]?.max ?? null;
    const usedMsg = Number(quotaRows.rows[0]?.used ?? 0);
    if (maxMsg !== null && usedMsg >= maxMsg) {
      await client.query(
        `UPDATE "CampaignRecipient" SET status = 'skipped', error = 'kuota pesan bulanan habis'
         WHERE "campaignId" = $1 AND status = 'pending'`,
        [campaign.id],
      );
      const finished = await finalizeCampaign(client, env, campaign.id);
      if (finished) {
        await enqueueCampaignCompleted(client, env, finished, finished);
        result.completed = true;
      }
      result.reason = "kuota bulanan habis — sisa penerima di-skip";
      return result;
    }
    const remainingQuota = maxMsg === null ? Infinity : Math.max(0, maxMsg - usedMsg);

    // 4. Cap harian per device (hari WIB).
    const capRows = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM "CampaignRecipient" cr JOIN "Campaign" c ON c.id = cr."campaignId"
       WHERE c."deviceId" = $1 AND cr.status = 'sent'
         AND cr."sentAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta')`,
      [device.id],
    );
    const sentToday = Number(capRows.rows[0]?.count ?? 0);
    if (sentToday >= CAMPAIGN_DAILY_CAP) {
      result.reason = `cap harian device tercapai (${sentToday}/${CAMPAIGN_DAILY_CAP})`;
      return result;
    }

    // 5a. Recovery: baris 'sending' tertinggal >10 menit (worker crash di
    //     tengah batch) dikembalikan ke 'pending' agar tidak menggantung.
    await client.query(
      `UPDATE "CampaignRecipient" SET status = 'pending', "updatedAt" = now()
       WHERE "campaignId" = $1 AND status = 'sending' AND "updatedAt" < now() - interval '10 minutes'`,
      [campaign.id],
    );

    // 5b. Claim batch pending secara atomic (aman utk tick tumpang-tindih).
    const claim = await client.query(
      `UPDATE "CampaignRecipient" cr SET status = 'sending', "updatedAt" = now()
       WHERE cr.id IN (
         SELECT id FROM "CampaignRecipient"
         WHERE "campaignId" = $1 AND status = 'pending'
         ORDER BY "createdAt" ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING cr.id, cr."chatId", cr.name`,
      [campaign.id, Math.min(BATCH_LIMIT, remainingQuota)],
    );
    const batch = claim.rows;
    result.claimed = batch.length;
    if (batch.length === 0) {
      const finished = await finalizeCampaign(client, env, campaign.id);
      if (finished) {
        await enqueueCampaignCompleted(client, env, finished, finished);
        result.completed = true;
      }
      result.reason = "batch kosong";
      return result;
    }

    // 6. Kirim berjeda acak.
    const wmAddon = await client.query(
      `SELECT 1 FROM "TenantAddon" WHERE "tenantId" = $1 AND key = 'remove_watermark' AND active LIMIT 1`,
      [campaign.tenantId],
    );
    const applyFootnote = wmAddon.rows.length === 0;
    const today = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

    for (let i = 0; i < batch.length; i++) {
      const recipient = batch[i];
      const vars = {
        nama: recipient.name ?? "",
        nomor: String(recipient.chatId).split("@")[0] ?? "",
        tanggal: today,
      };
      const caption = renderTemplate(campaign.messageBody, vars);
      try {
        let sendResult;
        if (campaign.mediaType && campaign.mediaUrl) {
          const mediaPath = `send-${campaign.mediaType}`;
          sendResult = await openwaSend(env, device.openwaSessionId, mediaPath, {
            chatId: recipient.chatId,
            url: campaign.mediaUrl,
            ...(campaign.filename ? { filename: campaign.filename } : {}),
            ...(caption ? { caption: applyFootnote ? withFootnote(caption, footnote(env)) : caption } : {}),
          });
        } else {
          const text = applyFootnote ? withFootnote(caption, footnote(env)) : caption;
          sendResult = await openwaSend(env, device.openwaSessionId, "send-text", {
            chatId: recipient.chatId,
            text,
          });
        }
        const messageId = sendResult?.messageId ?? sendResult?.id ?? null;
        await client.query(
          `UPDATE "CampaignRecipient" SET status = 'sent', "messageId" = $3, "sentAt" = now(), "updatedAt" = now() WHERE id = $2 AND "campaignId" = $1`,
          [campaign.id, recipient.id, messageId],
        );
        result.sent++;
      } catch (e) {
        await client.query(
          `UPDATE "CampaignRecipient" SET status = 'failed', error = $3, "sentAt" = now(), "updatedAt" = now() WHERE id = $2 AND "campaignId" = $1`,
          [campaign.id, recipient.id, String(e?.message ?? e).slice(0, 300)],
        );
        result.failed++;
        console.error(`campaign-dispatch: kirim gagal ${recipient.chatId}:`, e?.message ?? e);
      }
      // Jeda acak ANTAR pesan (bukan setelah terakhir).
      if (i < batch.length - 1) await sleep(jitterMs(campaign));
    }

    // 7. Finalisasi + event completion.
    const finished = await finalizeCampaign(client, env, campaign.id);
    if (finished) {
      await enqueueCampaignCompleted(client, env, finished, finished);
      result.completed = true;
    }
  } catch (e) {
    result.ok = false;
    result.errors.push(String(e?.message ?? e));
    console.error("campaign-dispatch: fatal", e);
  } finally {
    await client.end();
  }

  result.durationMs = Date.now() - started;
  return result;
}

const worker = {
  // Dispatcher sengaja on-demand agar tidak membangunkan Neon saat idle.
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
      }
      const url = new URL(request.url);
      const token = url.searchParams.get("token") ?? "";
      if (!env.DISPATCH_TOKEN || token !== env.DISPATCH_TOKEN) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const result = await runDispatch(env);
      return Response.json(result);
    } catch (e) {
      console.error("campaign-dispatch: unexpected", e);
      return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
    }
  },
};

export default worker;
