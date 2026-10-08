import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { recordAuditFromSession } from "@/lib/audit";
import { cookies } from "next/headers";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  
  // Guard: requirePlatformAdmin (or original admin role if already impersonating)
  const roleToCheck = session.user.originalAdminRole || session.user.role;
  if (roleToCheck !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id: tenantId } = await params;
  const tenant = await queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM "Tenant" WHERE id = $1',
    [tenantId],
  );
  if (!tenant) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });

  // Set cookies for impersonation
  const cookieStore = await cookies();
  cookieStore.set("impersonatedTenantId", tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 hours
  });
  cookieStore.set("originalAdminRole", "platform_admin", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
  });

  await recordAuditFromSession(session, {
    tenantId,
    action: "platform.impersonate_tenant",
    targetType: "tenant",
    targetId: tenantId,
    meta: { tenantName: tenant.name },
  });

  return Response.json({ ok: true, tenantId, tenantName: tenant.name });
}
