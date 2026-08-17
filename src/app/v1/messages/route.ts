import { verifyApiKey } from "@/lib/authStore";
import { normalizeChatId } from "@/lib/chat";
import { queryOne } from "@/lib/db";
import { openwa, OpenwaError } from "@/lib/openwa";
import { insertMessageLog } from "@/lib/messageStore";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

// API publik pihak ketiga: kirim pesan WhatsApp.
// Auth: Authorization: Bearer <API key> (dibuat dari dashboard → D1, 0 Neon utk verifikasi).
// Body: { to: "6281234567890" | "0812...", text: "...", deviceId?: "opsional" }
// Device yang dipakai: deviceId jika diberikan & milik tenant, kalau tidak device ready pertama.
export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, { status: 401 });
  }
  const tenantId = verified.tenantId;

  const rl = await checkRateLimit(`v1-messages:${tenantId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as {
    to?: unknown;
    text?: unknown;
    deviceId?: unknown;
  } | null;
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";

  if (!to || !text) {
    return Response.json({ error: "Field \"to\" dan \"text\" wajib diisi" }, { status: 400 });
  }
  if (text.length > 4096) {
    return Response.json({ error: "Text maksimal 4096 karakter" }, { status: 400 });
  }

  // Normalisasi nomor: 0812… → 62812…; 62812… dibiarkan; buang non-digit.
  const chatId = normalizeChatId(to);
  if (!chatId) {
    return Response.json(
      { error: "Nomor tidak valid. Gunakan format 6281234567890 atau 081234567890" },
      { status: 400 },
    );
  }

  // Pilih device: sesuai deviceId, atau device ready pertama milik tenant.
  const device = deviceId
    ? await queryOne<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
        [deviceId, tenantId],
      )
    : await queryOne<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, "openwaSessionId", status FROM "Device" WHERE "tenantId" = $1 AND status = $2 ORDER BY "updatedAt" DESC LIMIT 1',
        [tenantId, "ready"],
      );

  if (!device) {
    return Response.json(
      {
        error: deviceId
          ? "Device tidak ditemukan untuk tenant ini"
          : "Belum ada device yang tersambung (status ready)",
      },
      { status: deviceId ? 404 : 409 },
    );
  }
  if (device.status !== "ready") {
    return Response.json(
      { error: `Device \"${device.id}\" tidak siap (status: ${device.status})` },
      { status: 409 },
    );
  }

  try {
    const result = await openwa.sendText(device.openwaSessionId, chatId, text);
    // Catat pesan KELUAR (best-effort; kegagalan log tidak memengaruhi respons).
    const messageId = result?.messageId ?? result?.id ?? null;
    insertMessageLog({
      tenantId,
      deviceId: device.id,
      deviceLabel: device.label,
      direction: "outgoing",
      chatId,
      body: text,
      type: "text",
      status: typeof result?.status === "string" ? result.status : "sent",
      messageId,
    }).catch((e) => console.error("v1/messages: catat pesan keluar gagal:", e));
    return Response.json({
      ok: true,
      deviceId: device.id,
      to: chatId,
      messageId,
    });
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Catat kegagalan ke riwayat (status failed) agar terlihat di dashboard.
      insertMessageLog({
        tenantId,
        deviceId: device.id,
        deviceLabel: device.label,
        direction: "outgoing",
        chatId,
        body: text,
        type: "text",
        status: "failed",
        messageId: null,
      }).catch((err) => console.error("v1/messages: catat gagal kirim:", err));
      return Response.json({ error: `OpenWA: ${e.message}` }, { status: 502 });
    }
    console.error("v1/messages:", e);
    return Response.json({ error: "Gagal mengirim pesan" }, { status: 500 });
  }
}
