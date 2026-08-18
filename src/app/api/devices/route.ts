import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { openwa, openwaWebhookSecret, OpenwaError } from "@/lib/openwa";
import { uuidv7 } from "@/lib/uuidv7";
import { cloneDeviceToD1, listDevicesForTenant } from "@/lib/devices";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { checkDeviceQuota } from "@/lib/quota";
import {
  getCachedDeviceList,
  setCachedDeviceList,
  deleteCachedDeviceList,
} from "@/lib/deviceCache";

// URL ingest webhook Wavio — didaftarkan ke OpenWA per session.
function openwaWebhookUrl(): string {
  const base = process.env.WAVIO_PUBLIC_BASE_URL ?? "https://wavio.satupintudigital.co.id";
  return `${base}/api/webhooks/openwa`;
}

export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Cache hit → 0 koneksi Neon (halaman device di-reload sering).
  const cached = await getCachedDeviceList(tenantId);
  if (cached) return Response.json({ devices: cached });

  // Cache miss → query Neon + refresh cache.
  const devices = await listDevicesForTenant(tenantId);
  await setCachedDeviceList(tenantId, devices);
  return Response.json({ devices });
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit pembuatan device (mutasi) per tenant+IP.
  const rl = await checkRateLimit(`device-create:${tenantId}:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  // Kuota device plan — hard block sebelum bikin session OpenWA (hindari tulis sia-sia).
  const quota = await checkDeviceQuota(tenantId);
  if (!quota.ok) {
    return Response.json(
      {
        error: `Kuota device plan tercapai (${quota.used}/${quota.max}). Hapus device yang tidak dipakai atau hubungi admin untuk upgrade plan.`,
      },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return Response.json({ error: "Label wajib diisi" }, { status: 400 });
  if (label.length > 50) return Response.json({ error: "Label maksimal 50 karakter" }, { status: 400 });

  const deviceId = uuidv7();
  // Nama session OpenWA harus unik & hanya [a-zA-Z0-9-], 3–50 karakter.
  const sessionName = `wavio-${deviceId.replace(/-/g, "").slice(0, 12)}`;

  try {
    const owa = await openwa.createSession(sessionName);

    // Daftarkan webhook OpenWA → event (message.received, session.status) untuk
    // session ini dikirim ke ingest Wavio. Secret diturunkan deterministik per
    // session (openwaWebhookSecret) — tidak perlu disimpan. Gagal mendaftar →
    // hapus session (hindari orphan) + 502: device tanpa webhook tidak berguna.
    let openwaWebhookId: string | null = null;
    try {
      const wh = await openwa.registerWebhook(owa.id, {
        url: openwaWebhookUrl(),
        events: ["message.received", "session.status"],
        secret: await openwaWebhookSecret(owa.id),
        retryCount: 3,
      });
      openwaWebhookId = wh.id;
    } catch (whErr) {
      await openwa.deleteSession(owa.id).catch(() => {});
      throw whErr;
    }

    const now = new Date().toISOString();
    try {
      await query(
        'INSERT INTO "Device" (id, "tenantId", label, "openwaSessionId", "openwaWebhookId", status, "createdAt", "updatedAt") ' +
          "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
        [deviceId, tenantId, label, owa.id, openwaWebhookId, owa.status, now],
      );
    } catch (dbErr) {
      // Neon INSERT gagal → bersihkan registrasi OpenWA (session + webhook)
      // agar tidak ada orphan. Best-effort.
      if (openwaWebhookId) {
        await openwa.deleteWebhook(owa.id, openwaWebhookId).catch(() => {});
      }
      await openwa.deleteSession(owa.id).catch(() => {});
      throw dbErr;
    }
    await cloneDeviceToD1({
      id: deviceId,
      tenantId,
      label,
      openwaSessionId: owa.id,
      openwaWebhookId,
      phone: null,
      status: owa.status,
      createdAt: now,
      updatedAt: now,
    }).catch((e) => console.error("devices: clone D1 gagal:", e));
    await deleteCachedDeviceList(tenantId);
    return Response.json(
      {
        device: {
          id: deviceId,
          tenantId,
          label,
          openwaSessionId: owa.id,
          phone: null,
          status: owa.status,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof OpenwaError) {
      return Response.json({ error: `OpenWA: ${e.message}` }, { status: 502 });
    }
    return Response.json({ error: "Gagal membuat device" }, { status: 500 });
  }
}
