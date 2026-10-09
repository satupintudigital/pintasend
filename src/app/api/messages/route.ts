import { auth } from "@/lib/auth";
import { listMessagesPaginated, insertMessageLog } from "@/lib/messageStore";
import { resolveReadyDeviceForTenant } from "@/lib/devices";
import { normalizeChatId } from "@/lib/chat";
import { openwa } from "@/lib/openwa";

// Riwayat pesan tenant — baca Neon (tabel MessageLog, source of truth).
// Halaman dashboard /dashboard/pesan memakai endpoint ini.
// Query: q (cari body/chatId) · direction (incoming|outgoing) · page · limit
export async function GET(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const direction = url.searchParams.get("direction") ?? "";
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isInteger(rawPage) || rawPage < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    return Response.json({ error: "limit harus angka 1–50" }, { status: 400 });
  }
  if (q.length > 100) {
    return Response.json({ error: "q maksimal 100 karakter" }, { status: 400 });
  }

  try {
    const result = await listMessagesPaginated({
      tenantId,
      query: q,
      direction,
      deviceId: deviceId || undefined,
      status: status || undefined,
      page: rawPage,
      limit: rawLimit,
    });
    return Response.json({
      messages: result.messages,
      total: result.total,
      page: rawPage,
      limit: rawLimit,
    });
  } catch (e) {
    console.error("api/messages GET:", e);
    return Response.json({ error: "Gagal memuat riwayat pesan" }, { status: 500 });
  }
}

// Kirim pesan teks cepat dari dashboard (session-authenticated).
export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    deviceId?: string;
    to?: string;
    phone?: string;
    message?: string;
    text?: string;
  } | null;

  if (!body) return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });

  const rawPhone = typeof body.phone === "string" ? body.phone : typeof body.to === "string" ? body.to : "";
  const chatId = normalizeChatId(rawPhone);
  if (!chatId) return Response.json({ error: "Nomor tujuan tidak valid (contoh: 081234567890)" }, { status: 400 });

  const text = typeof body.message === "string" ? body.message.trim() : typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });

  const device = await resolveReadyDeviceForTenant(tenantId, typeof body.deviceId === "string" ? body.deviceId : undefined);
  if (!device) {
    return Response.json({ error: "Tidak ada perangkat WhatsApp yang aktif (status: ready)" }, { status: 400 });
  }

  const triggeredAt = new Date();
  try {
    const res = await openwa.sendText(device.openwaSessionId, chatId, text);
    const messageId = res.messageId ?? `msg_${Date.now()}`;
    const sentAt = new Date();

    await insertMessageLog({
      tenantId,
      deviceId: device.id,
      deviceLabel: device.label,
      direction: "outgoing",
      chatId,
      body: text,
      type: "text",
      status: "sent",
      messageId,
      triggeredAt,
      sentAt,
    }).catch((e) => console.error("insertMessageLog error:", e));

    return Response.json({ ok: true, messageId, to: chatId }, { status: 200 });
  } catch (err) {
    console.error("api/messages POST error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Gagal mengirim pesan via WhatsApp" },
      { status: 500 }
    );
  }
}
