import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const labels = await query<{
      id: string;
      name: string;
      color: string;
      openwaLabelId: string | null;
      isActive: boolean;
      createdAt: string;
      contactCount: number | string;
    }>(
      `SELECT l.id, l.name, l.color, l."openwaLabelId", l."isActive", l."createdAt",
              COALESCE(COUNT(lc.id), 0)::int as "contactCount"
       FROM "Label" l
       LEFT JOIN "LabelContact" lc ON lc."labelId" = l.id
       WHERE l."tenantId" = $1 AND l."isActive" = true
       GROUP BY l.id
       ORDER BY l.name ASC`,
      [tenantId]
    );

    const labelsWithCounts = labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      contactCount: Number(label.contactCount) || 0,
      openwaSynced: label.openwaLabelId !== null,
    }));

    return Response.json({ labels: labelsWithCounts });
  } catch (e) {
    console.error("GET /api/labels error:", e);
    return Response.json({ error: "Gagal memuat label" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; color?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color : "#6366f1";

  if (!name) return Response.json({ error: "Nama label wajib diisi" }, { status: 400 });

  try {
    // Check uniqueness
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM "Label" WHERE "tenantId" = $1 AND name = $2 AND "isActive" = true',
      [tenantId, name]
    );
    if (existing) return Response.json({ error: "Label dengan nama ini sudah ada" }, { status: 409 });

    const id = `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await query(
      'INSERT INTO "Label" (id, "tenantId", name, color, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, true, now(), now())',
      [id, tenantId, name, color]
    );

    return Response.json({ label: { id, name, color, contactCount: 0, openwaSynced: false } }, { status: 201 });
  } catch (e) {
    console.error("POST /api/labels error:", e);
    return Response.json({ error: "Gagal membuat label" }, { status: 500 });
  }
}
