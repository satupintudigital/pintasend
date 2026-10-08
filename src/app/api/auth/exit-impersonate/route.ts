import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { recordAuditFromSession } from "@/lib/audit";

export async function POST() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const impId = cookieStore.get("impersonatedTenantId")?.value;

  cookieStore.delete("impersonatedTenantId");
  cookieStore.delete("originalAdminRole");

  if (impId) {
    await recordAuditFromSession(session, {
      tenantId: impId,
      action: "platform.exit_impersonate",
      targetType: "tenant",
      targetId: impId,
    }).catch(() => {});
  }

  return Response.json({ ok: true });
}
