import { auth } from "@/lib/auth";
import { getTenantDetail } from "@/lib/platform";
import { listUsersPaginated } from "@/lib/authStore";

// Detail tenant + statistik + daftar user — khusus platform_admin.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const tenant = await getTenantDetail(id);
  if (!tenant) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });

  const { users, total } = await listUsersPaginated({ limit: 100, tenantId: id });
  return Response.json({ tenant, users, total });
}
