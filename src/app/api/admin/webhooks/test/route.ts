import { auth } from "@/lib/auth";
import { getWebhookForTenant } from "@/lib/webhookStore";
import { hmacSha256Hex } from "@/lib/hmac";
import { isSafeWebhookUrl } from "@/lib/ssrf";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

// Kirim event uji sintetis (message.received) ke URL webhook milik client —
// memakai jalur delivery yang sama dengan produksi (envelope + x-wavio-signature).
export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  const rl = await checkRateLimit(`webhook-test:${tenantId}:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const wh = await getWebhookForTenant(tenantId);
  if (!wh) {
    return Response.json({ error: "Konfigurasi webhook belum ada" }, { status: 404 });
  }
  if (!isSafeWebhookUrl(wh.url)) {
    return Response.json(
      { error: "URL webhook tidak aman (alamat internal/pribadi)" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const envelope = {
    event: "message.received",
    deviceId: "test-device",
    sessionId: "test-session",
    tenantId,
    timestamp: now,
    data: {
      id: `test_${now}`,
      chatId: "6281234567890@c.us",
      from: "6281234567890@c.us",
      to: "6289876543210@c.us",
      body: "✅ Ini pesan uji dari Wavio — pastikan endpoint-mu menerima webhook.",
      type: "text",
      direction: "incoming",
      status: "delivered",
      timestamp: Math.floor(now / 1000),
    },
  };
  const body = JSON.stringify(envelope);
  const signature = `sha256=${await hmacSha256Hex(wh.secret, body)}`;

  const started = Date.now();
  try {
    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Wavio-Webhook/1.0",
        "x-wavio-signature": signature,
        "x-wavio-event": "message.received",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - started;
    if (res.ok) {
      return Response.json({ ok: true, status: res.status, durationMs });
    }
    return Response.json(
      { ok: false, status: res.status, durationMs, error: `Endpoint merespons HTTP ${res.status}` },
      { status: 502 },
    );
  } catch (e) {
    return Response.json(
      {
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        error: e instanceof Error ? e.message : "Endpoint tidak dapat dijangkau",
      },
      { status: 502 },
    );
  }
}
