import { auth } from "@/lib/auth";
import { queryD1, queryD1One } from "@/lib/d1";

export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const labels = await queryD1<{
    id: string; name: string; color: string; openwaLabelId: string | null; isActive: number; createdAt: string;
  }>("SELECT * FROM Label WHERE tenantId = ? AND isActive = 1 ORDER BY name ASC", [tenantId]);

  // Get contact counts
  const labelsWithCounts = await Promise.all(
    labels.map(async (label) => {
      const countResult = await queryD1One<{ count: number }>(
        "SELECT COUNT(*) as count FROM LabelContact WHERE labelId = ?",
        [label.id]
      );
      return {
        id: label.id,
        name: label.name,
        color: label.color,
        contactCount: countResult?.count ?? 0,
        openwaSynced: label.openwaLabelId !== null,
      };
    })
  );

  return Response.json({ labels: labelsWithCounts });
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; color?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color : "#6366f1";

  if (!name) return Response.json({ error: "Nama label wajib diisi" }, { status: 400 });

  // Check uniqueness
  const existing = await queryD1One<{ id: string }>(
    "SELECT id FROM Label WHERE tenantId = ? AND name = ? AND isActive = 1",
    [tenantId, name]
  );
  if (existing) return Response.json({ error: "Label dengan nama ini sudah ada" }, { status: 409 });

  const id = `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  await queryD1One(
    "INSERT INTO Label (id, tenantId, name, color, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)",
    [id, tenantId, name, color, now, now]
  );

  return Response.json({ label: { id, name, color, contactCount: 0, openwaSynced: false } }, { status: 201 });
}
