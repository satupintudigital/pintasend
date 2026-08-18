import { auth } from "@/lib/auth";
import { OpenwaError, publicOpenwaError } from "@/lib/openwa";
import { createDeviceAndStart, listDevicesForTenant } from "@/lib/devices";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { checkDeviceQuota } from "@/lib/quota";
import { getCachedDeviceList, setCachedDeviceList } from "@/lib/deviceCache";

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

  try {
    const created = await createDeviceAndStart(label, tenantId);
    return Response.json(
      {
        device: {
          id: created.id,
          tenantId,
          label,
          openwaSessionId: created.openwaSessionId,
          phone: null,
          status: created.status,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Pesan publik generik — detail (status/message/host) hanya di log internal.
      return Response.json({ error: publicOpenwaError(e, "devices buat") }, { status: 502 });
    }
    return Response.json({ error: "Gagal membuat device" }, { status: 500 });
  }
}
