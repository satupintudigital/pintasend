import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { openwa, OpenwaError } from "@/lib/openwa";
import { uuidv7 } from "@/lib/uuidv7";
import { listDevicesForTenant } from "@/lib/devices";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const devices = await listDevicesForTenant(tenantId);
  return Response.json({ devices });
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit pembuatan device (mutasi) per tenant+IP.
  const rl = await checkRateLimit(`device-create:${tenantId}:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return Response.json({ error: "Label wajib diisi" }, { status: 400 });
  if (label.length > 50) return Response.json({ error: "Label maksimal 50 karakter" }, { status: 400 });

  const deviceId = uuidv7();
  // Nama session OpenWA harus unik & hanya [a-zA-Z0-9-], 3–50 karakter.
  const sessionName = `wavio-${deviceId.replace(/-/g, "").slice(0, 12)}`;

  try {
    const owa = await openwa.createSession(sessionName);
    await query(
      'INSERT INTO "Device" (id, "tenantId", label, "openwaSessionId", status) VALUES ($1, $2, $3, $4, $5)',
      [deviceId, tenantId, label, owa.id, owa.status],
    );
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
