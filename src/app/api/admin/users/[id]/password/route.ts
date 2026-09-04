import { auth } from "@/lib/auth";
import { canManageTenantMembers, parsePrincipal, unauthorized, forbidden } from "@/lib/abac";
import { resetTenantMemberPassword } from "@/lib/tenantMembers";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { recordAuditFromSession } from "@/lib/audit";

// Reset password user tenant — owner & tenant_admin.
// Sebelumnya route ini meng-update user hanya by id (tanpa scope tenant) —
// celah lintas-tenant. Sekarang lewat resetTenantMemberPassword yang melakukan
// getUserInTenant dulu (user tenant lain → 404), lalu write-through Neon → D1.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }

  const rl = await checkRateLimit(`admin-password:${p.tenantId}:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }
  if (password.length > 128) {
    return Response.json({ error: "Password maks. 128 karakter" }, { status: 400 });
  }

  try {
    const result = await resetTenantMemberPassword(id, p.tenantId, password);
    if (!result.ok) {
      return Response.json(
        { error: result.error ?? "Gagal mereset password" },
        { status: result.status ?? 400 },
      );
    }
    await recordAuditFromSession(session, {
      tenantId: p.tenantId,
      action: "user.password.reset",
      targetType: "user",
      targetId: id,
      meta: { by: "tenant_admin" },
    });
    return Response.json({ ok: true, d1Ok: result.data?.d1Ok });
  } catch (e) {
    console.error("admin/users/[id]/password:", e);
    return Response.json({ error: "Gagal mereset password" }, { status: 500 });
  }
}
