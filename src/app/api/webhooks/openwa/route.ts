// Ingest webhook dari OpenWA — endpoint publik yang didaftarkan ke OpenWA
// untuk setiap session device (POST /api/sessions/:id/webhooks).
//
// Alur:
//   1. Terima raw body + header `x-openwa-signature: sha256=<hmac>`.
//   2. Verifikasi signature dulu (secret deterministik per session) — SEMUA
//      lookup DB hanya terjadi setelah signature valid. Ini membuat endpoint
//      aman dari spam lookup tak terautentikasi.
//   3. Lookup device by openwaSessionId (baca D1 = 0 Neon; fallback Neon + clone D1).
//   4. Baca konfigurasi webhook tenant (D1). Jika tidak ada / nonaktif / event
//      tidak disubscribe → ack 200 (OpenWA tidak perlu retry).
//   5. Tulis event ke OUTBOX (WebhookDelivery, status pending) lalu coba
//      deliver SEKALI secara sinkron (timeout 5 dtk). Gagal → baris tetap
//      pending + nextAttemptAt = backoff; worker cron (workers/webhook-delivery)
//      menuntaskan retry (+30s, +5m, lalu dead-letter). Selalu balas 2xx agar
//      OpenWA tidak retry (retry OpenWA = event duplikat — retry ditangani
//      outbox). Detail: src/lib/webhookDelivery.ts.
//
// Selalu balas 2xx setelah verifikasi lolos agar OpenWA tidak retry duplicate;
// OpenWA sendiri sudah retry (retryCount=3) ke endpoint ini bila request masuk
// gagal/5xx.
//
// X-Request-Id: dipakai dari header masuk (valid) atau generate uuidv7; diecho
// di header respons & dipakai sebagai korelasi semua log event request (lihat
// src/lib/requestLogger.ts). Log terstruktur (JSON per baris) memudahkan tracing
// event per request di agregator log.

import { openwaWebhookSecret } from "@/lib/openwa";
import { hmacSha256Hex, verifySignature } from "@/lib/hmac";
import { changesD1, queryD1One } from "@/lib/d1";
import { query } from "@/lib/db";
import { cloneDeviceToD1, getDeviceBySessionId, openwaRestrictionToJson } from "@/lib/devices";
import { getWebhookForTenant } from "@/lib/webhookStore";
import { evaluateFilters } from "@/lib/webhookFilters";
import { isSafeWebhookUrl } from "@/lib/ssrf";
import { deleteCachedDevice, deleteCachedDeviceList } from "@/lib/deviceCache";
import {
  insertMessageLog,
  isMessageDeliveryStatus,
  mergeMessageReaction,
  setMessageReactions,
  updateMessageDeliveryStatus,
} from "@/lib/messageStore";
import { getRequestId, logEvent } from "@/lib/requestLogger";
import {
  deliverWebhookOnce,
  enqueueWebhookDelivery,
  markWebhookDelivery,
  nextRetryDelayMs,
  DELIVERY_MAX_ATTEMPTS,
} from "@/lib/webhookDelivery";

interface DeviceD1Row {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  openwaWebhookId: string | null;
  status: string;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  // Raw body WAJIB dipertahankan untuk verifikasi HMAC (jangan re-parse/reserialize).
  const raw = await req.text();
  if (!raw) {
    logEvent("warn", "webhook_invalid_body", requestId, { reason: "empty body" });
    return Response.json(
      { ok: false, error: "empty body" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  let payload: {
    event?: unknown;
    sessionId?: unknown;
    timestamp?: unknown;
    data?: unknown;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    logEvent("warn", "webhook_invalid_body", requestId, { reason: "invalid json" });
    return Response.json(
      { ok: false, error: "invalid json" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  // Envelope OpenWA: { event, sessionId, timestamp, data }. Parsing defensif.
  const dataObj = (payload.data ?? {}) as { sessionId?: unknown; event?: unknown };
  const sessionId =
    (typeof payload.sessionId === "string" && payload.sessionId) ||
    (typeof dataObj.sessionId === "string" ? dataObj.sessionId : "") ||
    "";
  const event =
    (typeof payload.event === "string" && payload.event) ||
    (typeof dataObj.event === "string" ? dataObj.event : "") ||
    "";
  if (!sessionId) {
    logEvent("warn", "webhook_missing_session", requestId);
    return Response.json(
      { ok: false, error: "sessionId tidak ada" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  // 1. Verifikasi signature — SEBELUM lookup apa pun. Secret diturunkan dari
  //    sessionId di payload (bukan dari DB), jadi tidak perlu DB dulu.
  const signature = req.headers.get("x-openwa-signature");
  const valid = await verifySignature(await openwaWebhookSecret(sessionId), raw, signature);
  if (!valid) {
    logEvent("warn", "webhook_signature_invalid", requestId, { sessionId });
    return Response.json(
      { ok: false, error: "signature tidak valid" },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  // 2. Lookup device by session — D1 dulu (0 Neon per event), Neon sebagai
  //    fallback saat D1 belum punya (device baru sebelum resync) + clone balik.
  let device = await queryD1One<DeviceD1Row>(
    "SELECT id, tenantId, label, openwaSessionId, openwaWebhookId, status FROM Device WHERE openwaSessionId = ?",
    [sessionId],
  );
  if (!device) {
    const dev = await getDeviceBySessionId(sessionId);
    if (dev) {
      device = {
        id: dev.id,
        tenantId: dev.tenantId,
        label: dev.label,
        openwaSessionId: dev.openwaSessionId,
        openwaWebhookId: dev.openwaWebhookId,
        status: dev.status,
      };
      await cloneDeviceToD1(dev).catch((e) =>
        logEvent("error", "webhook_clone_failed", requestId, { tenantId: dev.tenantId, detail: String(e) }),
      );
    }
  }
  if (!device) {
    // Session tidak terdaftar di Wavio — ack diam-diam agar OpenWA tidak retry
    // berulang (log untuk investigasi).
    logEvent("error", "webhook_unknown_session", requestId, { sessionId });
    return Response.json({ ok: true, skipped: "unknown session" }, { headers: { "x-request-id": requestId } });
  }

  // 2b. Catat pesan MASUK ke riwayat (best-effort — gagal log tidak menghalangi
  //     forwarding). Diletakkan SEBELUM cek konfigurasi webhook agar riwayat
  //     tetap tercatat walau tenant belum punya URL forwarding.
  if (event === "message.received") {
    const d = (payload.data ?? {}) as Record<string, unknown>;
    // Pesan media: OpenWA menaruh detail di `data.media` ({ mimetype, filename,
    // data?, omitted?, sizeBytes? }); caption bisa di `data.caption`/`data.body`.
    const media = (d.media ?? {}) as Record<string, unknown>;
    const isMedia =
      typeof d.type === "string" &&
      ["image", "video", "audio", "voice", "document", "sticker"].includes(d.type.toLowerCase());
    const caption = typeof d.caption === "string" ? d.caption : "";
    const mediaFilename = typeof media.filename === "string" ? media.filename : "";
    const bodyText =
      (typeof d.body === "string" && d.body ? d.body : caption) || (isMedia ? mediaFilename : "");
    await insertMessageLog({
      tenantId: device.tenantId,
      deviceId: device.id,
      deviceLabel: device.label ?? null,
      direction: "incoming",
      chatId:
        (typeof d.chatId === "string" ? d.chatId : "") ||
        (typeof d.from === "string" ? d.from : "") ||
        "",
      body: bodyText, // insertMessageLog memotong ke MAX_BODY_LENGTH
      type: typeof d.type === "string" ? d.type : null,
      status: typeof d.status === "string" ? d.status : null,
      messageId: typeof d.id === "string" ? d.id : null,
      // Tidak ada URL publik dari event — hanya mimetype (+ filename via body).
      mediaUrl: null,
      mimetype:
        (typeof media.mimetype === "string" ? media.mimetype : "") ||
        (typeof d.mimetype === "string" ? d.mimetype : null),
    }).catch((e) => logEvent("error", "webhook_log_failed", requestId, { tenantId: device.tenantId, detail: String(e) }));
  }

  // 2c. Ack pengiriman: `message.ack` (delivered/read) & `message.failed`
  //     (failed) memajukan status pesan KELUAR di riwayat. Ditempatkan SEBELUM
  //     cek konfigurasi webhook agar status riwayat tetap ter-update walau
  //     tenant belum punya URL forwarding (konsisten dgn pencatatan pesan masuk).
  //     Envelope OpenWA: data = { id, messageId, status, ack } — status netral
  //     (delivered/read/failed/sent/pending); hanya 3 yang memajukan status.
  if (event === "message.ack" || event === "message.failed") {
    const d = (payload.data ?? {}) as Record<string, unknown>;
    const ackMessageId =
      (typeof d.messageId === "string" && d.messageId) ||
      (typeof d.id === "string" && d.id) ||
      "";
    const ackStatus = typeof d.status === "string" ? d.status.toLowerCase() : "";
    if (ackMessageId && isMessageDeliveryStatus(ackStatus)) {
      await updateMessageDeliveryStatus(device.tenantId, ackMessageId, ackStatus).catch((e) =>
        logEvent("error", "webhook_ack_update_failed", requestId, {
          tenantId: device.tenantId,
          deviceId: device.id,
          messageId: ackMessageId,
          status: ackStatus,
          detail: String(e),
        }),
      );
    }
  }

  // 2d. Reaksi pesan: `message.reaction` mencatat reaksi emoji pada pesan ke
  //     MessageLog.reaction (JSON map senderId→emoji). Snapshot lengkap
  //     (`reactions`) dipakai bila tersedia; selain itu merge satu sender.
  if (event === "message.reaction") {
    const d = (payload.data ?? {}) as Record<string, unknown>;
    const reactionMessageId =
      (typeof d.messageId === "string" && d.messageId) ||
      (typeof d.id === "string" && d.id) ||
      "";
    const senderId = typeof d.senderId === "string" ? d.senderId : "";
    const reaction = typeof d.reaction === "string" ? d.reaction : "";
    if (reactionMessageId) {
      const snapshot = d.reactions;
      const apply = (() => {
        if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
          const map: Record<string, string> = {};
          for (const [k, v] of Object.entries(snapshot as Record<string, unknown>)) {
            if (typeof v === "string" && v.length > 0) map[k] = v;
          }
          return setMessageReactions(device.tenantId, reactionMessageId, map);
        }
        if (senderId) return mergeMessageReaction(device.tenantId, reactionMessageId, senderId, reaction);
        return Promise.resolve(false);
      })();
      await apply.catch((e) =>
        logEvent("error", "webhook_reaction_update_failed", requestId, {
          tenantId: device.tenantId,
          messageId: reactionMessageId,
          detail: String(e),
        }),
      );
    }
  }

  // 2e. Pembatasan akun: `session.restriction` menulis kolom Device.restriction
  //     (Neon + D1) + invalidasi cache. Ditempatkan SEBELUM cek konfigurasi
  //     webhook agar status pembatasan tetap tercatat walau tenant belum
  //     subscribe event ini (konsisten dgn pencatatan pesan masuk / ack / reaksi).
  //     Data bisa { kind, code, expiresAt } atau dibungkus { restriction: {...} };
  //     `openwaRestrictionToJson` menormalisasi keduanya (null = pembatasan dicabut).
  if (event === "session.restriction") {
    const restrictionJson = openwaRestrictionToJson(payload.data);
    try {
      const now = new Date().toISOString();
      await query('UPDATE "Device" SET restriction = $1, "updatedAt" = now() WHERE id = $2', [
        restrictionJson,
        device.id,
      ]);
      await changesD1("UPDATE Device SET restriction = ?, updatedAt = ? WHERE id = ?", [
        restrictionJson,
        now,
        device.id,
      ]);
      await deleteCachedDevice(device.id).catch(() => {});
      await deleteCachedDeviceList(device.tenantId).catch(() => {});
    } catch (e) {
      logEvent("error", "webhook_restriction_update_failed", requestId, {
        tenantId: device.tenantId,
        deviceId: device.id,
        detail: String(e),
      });
    }
  }

  // 3. Konfigurasi webhook tenant.
  const wh = await getWebhookForTenant(device.tenantId);
  if (!wh || !wh.active) {
    logEvent("info", "webhook_skipped", requestId, {
      tenantId: device.tenantId,
      reason: "no webhook configured",
    });
    return Response.json({ ok: true, skipped: "no webhook configured" }, { headers: { "x-request-id": requestId } });
  }
  if (event && !wh.events.includes(event)) {
    logEvent("info", "webhook_skipped", requestId, {
      tenantId: device.tenantId,
      reason: "event not subscribed",
      openwaEvent: event,
    });
    return Response.json(
      { ok: true, skipped: "event not subscribed", event },
      { headers: { "x-request-id": requestId } },
    );
  }

  // 3b. Event session.status → segarkan status device di D1 (best-effort) +
  //     invalidasi cache. Catatan: polling GET /api/devices/[id] tetap menulis
  //     status ke Neon tiap 2,5 dtk; update D1 di sini hanya mempercepat
  //     konsistensi (resync job bisa menimpa ke nilai Neon, tidak berbahaya).
  if (event === "session.status") {
    const d = payload.data as { status?: unknown; phone?: unknown } | undefined;
    const newStatus = typeof d?.status === "string" ? d.status : null;
    if (newStatus) {
      try {
        const now = new Date().toISOString();
        await changesD1("UPDATE Device SET status = ?, updatedAt = ? WHERE openwaSessionId = ?", [
          newStatus,
          now,
          sessionId,
        ]);
        if (d && typeof d.phone === "string") {
          await changesD1("UPDATE Device SET phone = ?, updatedAt = ? WHERE openwaSessionId = ?", [
            d.phone,
            now,
            sessionId,
          ]);
        }
        await deleteCachedDevice(device.id).catch(() => {});
        await deleteCachedDeviceList(device.tenantId).catch(() => {});
      } catch (e) {
        logEvent("error", "webhook_status_update_failed", requestId, {
          tenantId: device.tenantId,
          deviceId: device.id,
          detail: String(e),
        });
      }
    }
  }

  // 3c. Smart filters (opsional): pre-filter event KONTEN (message.received /
  //     message.edited) sebelum forwarding. Bila kondisi tidak lolos → skip
  //     forwarding (tetap 200, OpenWA tidak retry). Event non-konten selalu lolos.
  if (!evaluateFilters(wh.filters, event, (payload.data ?? {}) as Record<string, unknown>)) {
    logEvent("info", "webhook_skipped", requestId, {
      tenantId: device.tenantId,
      reason: "filtered by smart filters",
      openwaEvent: event,
    });
    return Response.json(
      { ok: true, skipped: "filtered", event },
      { headers: { "x-request-id": requestId } },
    );
  }

  // 4. Envelope delivery ke client + tanda tangan. SSRF guard (defense-in-depth;
  //    admin PUT sudah memvalidasi saat simpan, tapi konfigurasi bisa basi).
  if (!isSafeWebhookUrl(wh.url)) {
    logEvent("error", "webhook_skipped", requestId, {
      tenantId: device.tenantId,
      reason: "unsafe url",
    });
    return Response.json({ ok: true, skipped: "unsafe url" }, { headers: { "x-request-id": requestId } });
  }
  const envelope = {
    event,
    deviceId: device.id,
    sessionId,
    tenantId: device.tenantId,
    timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
    data: payload.data ?? payload,
  };
  const body = JSON.stringify(envelope);
  const clientSig = `sha256=${await hmacSha256Hex(wh.secret, body)}`;

  // 5. OUTBOX: tulis baris pending dulu (durable), lalu coba deliver SEKALI.
  //    - INSERT ke Neon cepat & tidak bergantung pada ketersediaan client.
  //    - Attempt pertama sinkron (timeout 5 dtk) → latency rendah utk kasus normal.
  //    - Gagal → baris tetap pending + nextAttemptAt = backoff; worker cron
  //      (workers/webhook-delivery) mengambil alih retry sampai MAX_ATTEMPTS.
  //    - Selalu balas 2xx setelah INSERT sukses agar OpenWA TIDAK retry
  //      (retry OpenWA = event duplikat; retry sudah ditangani outbox).
  let deliveryId: string | null = null;
  try {
    deliveryId = await enqueueWebhookDelivery({
      tenantId: device.tenantId,
      webhookId: wh.id,
      event,
      url: wh.url,
      payload: body,
      signature: clientSig,
    });
  } catch (e) {
    logEvent("error", "webhook_enqueue_failed", requestId, {
      tenantId: device.tenantId,
      detail: String(e),
    });
    return Response.json(
      { ok: false, error: "enqueue gagal" },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
  logEvent("info", "webhook_enqueued", requestId, {
    tenantId: device.tenantId,
    deviceId: device.id,
    openwaEvent: event,
    deliveryId,
  });

  const result = await deliverWebhookOnce(wh.url, body, clientSig, event);
  if (result.ok) {
    await markWebhookDelivery(deliveryId, { status: "delivered", attempts: 1 }).catch((e) =>
      logEvent("error", "webhook_mark_failed", requestId, { deliveryId, detail: String(e) }),
    );
    logEvent("info", "webhook_delivered", requestId, {
      tenantId: device.tenantId,
      openwaEvent: event,
      deliveryId,
      status: result.status,
    });
  } else {
    // Gagal → attempt 1 tercatat, nextAttemptAt = now + 30s (backoff berikutnya
    // ditangani worker). Jika sudah maksimal (tidak mungkin di attempt 1, tapi
    // defensif) → dead-letter.
    const delayMs = nextRetryDelayMs(1);
    await markWebhookDelivery(deliveryId, {
      status: delayMs === null ? "failed" : "pending",
      attempts: 1,
      nextAttemptAt: delayMs === null ? null : new Date(Date.now() + delayMs),
      lastError: result.error ?? `HTTP ${result.status}`,
    }).catch((e) => logEvent("error", "webhook_mark_failed", requestId, { deliveryId, detail: String(e) }));
    logEvent("error", "webhook_delivery_failed", requestId, {
      tenantId: device.tenantId,
      openwaEvent: event,
      deliveryId,
      status: result.status,
      error: result.error ?? null,
    });
  }

  return Response.json(
    {
      ok: true,
      event,
      delivered: result.ok,
      status: result.status,
      attempts: 1,
      maxAttempts: DELIVERY_MAX_ATTEMPTS,
    },
    { headers: { "x-request-id": requestId } },
  );
}
