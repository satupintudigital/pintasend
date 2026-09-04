import { auth } from "@/lib/auth";
import { deleteContact, patchContact } from "@/lib/contacts";

// Dashboard — sunting/hapus kontak by id.
//   PATCH  { name?, tags?, optedOut?, notes? }
//   DELETE

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!id?.trim() || !body || typeof body !== "object") {
    return Response.json({ error: "Request tidak valid" }, { status: 400 });
  }

  try {
    const ok = await patchContact(tenantId, id.trim(), {
      ...(body.name !== undefined ? { name: typeof body.name === "string" ? body.name : null } : {}),
      ...(body.tags !== undefined && Array.isArray(body.tags)
        ? { tags: (body.tags as unknown[]).filter((t): t is string => typeof t === "string") }
        : {}),
      ...(typeof body.optedOut === "boolean" ? { optedOut: body.optedOut } : {}),
      ...(body.notes !== undefined ? { notes: typeof body.notes === "string" ? body.notes : null } : {}),
    });
    if (!ok) return Response.json({ error: "Kontak tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("campaigns/contacts PATCH:", e);
    return Response.json({ error: "Gagal menyimpan kontak" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const ok = await deleteContact(tenantId, id?.trim() ?? "");
    if (!ok) return Response.json({ error: "Kontak tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("campaigns/contacts DELETE:", e);
    return Response.json({ error: "Gagal menghapus kontak" }, { status: 500 });
  }
}
