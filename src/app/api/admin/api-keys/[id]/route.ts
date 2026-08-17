import { auth } from "@/lib/auth";
import { revokeApiKey } from "@/lib/authStore";

// Revoke (cabut) API key — owner-only. Key yang dicabut langsung ditolak
// verifikasi (auth baca D1, write-through Neon → D1).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const ok = await revokeApiKey(id, tenantId);
    if (!ok) return Response.json({ error: "API key tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("admin/api-keys DELETE:", e);
    return Response.json({ error: "Gagal mencabut API key" }, { status: 500 });
  }
}
