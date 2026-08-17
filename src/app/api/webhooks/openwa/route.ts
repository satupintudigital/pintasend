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
//   5. Teruskan event ke URL milik client (envelope Wavio + x-wavio-signature)
//      SECARA SINKRON dengan timeout 5 dtk. (Catatan: after() dari next/server
//      tidak dieksekusi di runtime OpenNext Cloudflare — diverifikasi live.
//      Sinkron = andal; risiko: endpoint client yang lambat membuat OpenWA
//      timeout & retry → event duplikat. Diterima utk MVP.)
//
// Selalu balas 2xx setelah verifikasi lolos agar OpenWA tidak retry duplicate;
// OpenWA sendiri sudah retry (retryCount=3) ke endpoint ini bila request masuk
// gagal/5xx.

import { openwaWebhookSecret } from "@/lib/openwa";
import { hmacSha256Hex, verifySignature } from "@/lib/hmac";
import { changesD1, queryD1One } from "@/lib/d1";
import { cloneDeviceToD1, getDeviceBySessionId } from "@/lib/devices";
import { getWebhookForTenant } from "@/lib/webhookStore";
import { isSafeWebhookUrl } from "@/lib/ssrf";
import { deleteCachedDevice, deleteCachedDeviceList } from "@/lib/deviceCache";
import { insertMessageLog } from "@/lib/messageStore";

interface DeviceD1Row {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  openwaWebhookId: string | null;
  status: string;
}

export async function POST(req: Request) {
  // Raw body WAJIB dipertahankan untuk verifikasi HMAC (jangan re-parse/reserialize).
  const raw = await req.text();
  if (!raw) return Response.json({ ok: false, error: "empty body" }, { status: 400 });

  let payload: {
    event?: unknown;
    sessionId?: unknown;
    timestamp?: unknown;
    data?: unknown;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
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
    return Response.json({ ok: false, error: "sessionId tidak ada" }, { status: 400 });
  }

  // 1. Verifikasi signature — SEBELUM lookup apa pun. Secret diturunkan dari
  //    sessionId di payload (bukan dari DB), jadi tidak perlu DB dulu.
  const signature = req.headers.get("x-openwa-signature");
  const valid = await verifySignature(await openwaWebhookSecret(sessionId), raw, signature);
  if (!valid) {
    return Response.json({ ok: false, error: "signature tidak valid" }, { status: 401 });
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
      await cloneDeviceToD1(dev).catch((e) => console.error("webhook ingest: clone D1 gagal:", e));
    }
  }
  if (!device) {
    // Session tidak terdaftar di Wavio — ack diam-diam agar OpenWA tidak retry
    // berulang (log untuk investigasi).
    console.error("webhook ingest: session tidak dikenal:", sessionId);
    return Response.json({ ok: true, skipped: "unknown session" });
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
    }).catch((e) => console.error("webhook ingest: catat pesan masuk gagal:", e));
  }

  // 3. Konfigurasi webhook tenant.
  const wh = await getWebhookForTenant(device.tenantId);
  if (!wh || !wh.active) {
    return Response.json({ ok: true, skipped: "no webhook configured" });
  }
  if (event && !wh.events.includes(event)) {
    return Response.json({ ok: true, skipped: "event not subscribed", event });
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
        console.error("webhook ingest: update status D1 gagal:", e);
      }
    }
  }

  // 4. Envelope delivery ke client + tanda tangan. SSRF guard (defense-in-depth;
  //    admin PUT sudah memvalidasi saat simpan, tapi konfigurasi bisa basi).
  if (!isSafeWebhookUrl(wh.url)) {
    console.error("webhook ingest: URL client tidak aman (SSRF guard):", wh.url);
    return Response.json({ ok: true, skipped: "unsafe url" });
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

  // 5. Forward ke client (sinkron, timeout 5 dtk).
  const result = await deliverWebhook(wh.url, body, clientSig, event);
  if (!result.ok) {
    console.error(`webhook ingest: delivery ke ${wh.url} gagal (HTTP ${result.status})`);
  }
  return Response.json({
    ok: true,
    event,
    delivered: result.ok,
    status: result.status,
  });
}

async function deliverWebhook(
  url: string,
  body: string,
  signature: string,
  event: string,
): Promise<{ ok: boolean; status: number }> {
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
    signal: AbortSignal.timeout(5_000),
  });
  return { ok: res.ok, status: res.status };
}
