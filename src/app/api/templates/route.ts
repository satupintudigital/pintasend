import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { openwa } from "@/lib/openwa";

interface CanonicalTemplateRow {
  id: string;
  name: string;
  header: string | null;
  body: string;
  footer: string | null;
  version: number;
  syncStatus: string;
  syncedAt: string | null;
}

// Daftar template untuk dashboard tenant. Canonical catalog PintaSend menjadi
// sumber utama sehingga nama physical OpenWA (mis. nala_new_order_v4) tidak
// pernah bocor ke UI. Device baru/offline tetap terlihat sebagai pending.
// Bila tenant belum memiliki catalog canonical, pertahankan fallback legacy
// agar template OpenWA yang dibuat manual tetap bisa dikirim.
export async function GET(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const deviceId = (url.searchParams.get("deviceId") ?? "").trim();
  if (!deviceId) return Response.json({ error: "deviceId wajib diisi" }, { status: 400 });

  const device = await queryOne<{ id: string; openwaSessionId: string }>(
    'SELECT id, "openwaSessionId" FROM "Device" WHERE id = $1 AND "tenantId" = $2',
    [deviceId, tenantId],
  );
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  try {
    const canonical = await query<CanonicalTemplateRow>(
      `SELECT t.id,
              t."canonicalName" AS name,
              t.header,
              t.body,
              t.footer,
              t.version,
              COALESCE(b.status, 'pending') AS "syncStatus",
              b."syncedAt" AS "syncedAt"
       FROM "TenantWhatsAppTemplate" t
       LEFT JOIN "TenantWhatsAppTemplateDevice" b
         ON b."templateId" = t.id AND b."deviceId" = $2
       WHERE t."tenantId" = $1 AND t."isActive" = true
       ORDER BY t.event ASC`,
      [tenantId, deviceId],
    );
    if (canonical.length > 0) return Response.json({ templates: canonical });

    const legacy = await openwa.listTemplates(device.openwaSessionId);
    return Response.json({ templates: Array.isArray(legacy) ? legacy : [] });
  } catch (e) {
    console.error("api/templates GET:", e);
    return Response.json({ error: "Gateway WhatsApp sedang bermasalah" }, { status: 502 });
  }
}
