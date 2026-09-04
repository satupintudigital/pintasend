import { auth } from "@/lib/auth";
import { revokeApiKey } from "@/lib/authStore";
import { recordAuditFromSession } from "@/lib/audit";
import {
  canManageTenantMembers,
  parsePrincipal,
  unauthorized,
  forbidden,
  type SessionLike,
} from "@/lib/abac";

function requireMemberManager(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }
  return null;
}

// Revoke (cabut) API key — owner & tenant_admin. Key yang dicabut langsung
// ditolak verifikasi (auth baca D1, write-through Neon → D1).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const p = parsePrincipal(session);
  const tenantId = p?.tenantId ?? "";

  const { id } = await params;
  try {
    const ok = await revokeApiKey(id, tenantId);
    if (!ok) return Response.json({ error: "API key tidak ditemukan" }, { status: 404 });
    await recordAuditFromSession(session, {
      tenantId,
      action: "apikey.revoke",
      targetType: "apikey",
      targetId: id,
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("admin/api-keys DELETE:", e);
    return Response.json({ error: "Gagal mencabut API key" }, { status: 500 });
  }
}
