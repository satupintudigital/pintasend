import { auth } from "@/lib/auth";
import { queryD1One } from "@/lib/d1";

export async function PUT(req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown; color?: unknown } | null;

  const label = await queryD1One<{ id: string }>(
    "SELECT id FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, tenantId]
  );
  if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

  const updates: string[] = [];
  const params_: unknown[] = [];

  if (typeof body?.name === "string" && body.name.trim()) {
    updates.push("name = ?");
    params_.push(body.name.trim());
  }
  if (typeof body?.color === "string") {
    updates.push("color = ?");
    params_.push(body.color);
  }

  if (updates.length > 0) {
    updates.push("updatedAt = ?");
    params_.push(new Date().toISOString());
    params_.push(labelId);
    params_.push(tenantId);
    await queryD1One(`UPDATE Label SET ${updates.join(", ")} WHERE id = ? AND tenantId = ?`, params_);
  }

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;

  const label = await queryD1One<{ id: string }>(
    "SELECT id FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, tenantId]
  );
  if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

  await queryD1One("UPDATE Label SET isActive = 0, updatedAt = ? WHERE id = ?", [new Date().toISOString(), labelId]);

  return Response.json({ ok: true });
}
