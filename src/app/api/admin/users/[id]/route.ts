import { auth } from "@/lib/auth";
import { canManageTenantMembers, parsePrincipal, unauthorized, forbidden, type SessionLike } from "@/lib/abac";
import { removeTenantMember, updateTenantMemberRole } from "@/lib/tenantMembers";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { recordAuditFromSession } from "@/lib/audit";

function requireMemberManager(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }
  return null;
}

// Ubah role user (member ↔ tenant_admin) — tenant pemilik sesi.
// Body: { role: "member" | "tenant_admin" }.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const p = parsePrincipal(session) as NonNullable<ReturnType<typeof parsePrincipal>>;

  const rl = await checkRateLimit(`admin-user-patch:${p.tenantId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { role?: unknown } | null;
  const role = typeof body?.role === "string" ? body.role : "";

  try {
    const result = await updateTenantMemberRole(id, p.tenantId, role);
    if (!result.ok) {
      return Response.json(
        { error: result.error ?? "Gagal mengubah role" },
        { status: result.status ?? 400 },
      );
    }
    await recordAuditFromSession(session, {
      tenantId: p.tenantId,
      action: "user.role.update",
      targetType: "user",
      targetId: id,
      meta: { role },
    });
    return Response.json({ ok: true, role, d1Ok: result.data?.d1Ok });
  } catch (e) {
    console.error("admin/users/[id] PATCH:", e);
    return Response.json({ error: "Gagal mengubah role" }, { status: 500 });
  }
}

// Hapus user dari tenant (bukan hapus diri sendiri / owner — dijaga service).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const p = parsePrincipal(session) as NonNullable<ReturnType<typeof parsePrincipal>>;

  const rl = await checkRateLimit(`admin-user-delete:${p.tenantId}:${clientIp(_req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;
  try {
    const result = await removeTenantMember(id, p.tenantId, p);
    if (!result.ok) {
      return Response.json(
        { error: result.error ?? "Gagal menghapus user" },
        { status: result.status ?? 400 },
      );
    }
    await recordAuditFromSession(session, {
      tenantId: p.tenantId,
      action: "user.remove",
      targetType: "user",
      targetId: id,
    });
    return Response.json({ ok: true, d1Ok: result.data?.d1Ok });
  } catch (e) {
    console.error("admin/users/[id] DELETE:", e);
    return Response.json({ error: "Gagal menghapus user" }, { status: 500 });
  }
}
