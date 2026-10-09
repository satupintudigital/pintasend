import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown; color?: unknown } | null;

  try {
    const label = await queryOne<{ id: string }>(
      'SELECT id FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
      [labelId, tenantId]
    );
    if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

    const updates: string[] = [];
    const params_: unknown[] = [];

    if (typeof body?.name === "string" && body.name.trim()) {
      const trimmedName = body.name.trim();
      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM "Label" WHERE "tenantId" = $1 AND name = $2 AND id != $3 AND "isActive" = true',
        [tenantId, trimmedName, labelId]
      );
      if (existing) return Response.json({ error: "Label dengan nama ini sudah ada" }, { status: 409 });

      updates.push(`name = $${params_.length + 1}`);
      params_.push(trimmedName);
    }
    if (typeof body?.color === "string") {
      updates.push(`color = $${params_.length + 1}`);
      params_.push(body.color);
    }

    if (updates.length > 0) {
      updates.push(`"updatedAt" = now()`);
      params_.push(labelId);
      params_.push(tenantId);
      await query(
        `UPDATE "Label" SET ${updates.join(", ")} WHERE id = $${params_.length - 1} AND "tenantId" = $${params_.length}`,
        params_
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/labels/[labelId] error:", e);
    return Response.json({ error: "Gagal update label" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;

  try {
    const label = await queryOne<{ id: string }>(
      'SELECT id FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
      [labelId, tenantId]
    );
    if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

    await query('UPDATE "Label" SET "isActive" = false, "updatedAt" = now() WHERE id = $1', [labelId]);

    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/labels/[labelId] error:", e);
    return Response.json({ error: "Gagal menghapus label" }, { status: 500 });
  }
}
