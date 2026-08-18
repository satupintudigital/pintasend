import { auth } from "@/lib/auth";
import { listPlans } from "@/lib/platform";

// Daftar plan — khusus platform_admin.
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  try {
    const plans = await listPlans();
    return Response.json({ plans });
  } catch (e) {
    console.error("platform/plans:", e);
    return Response.json({ error: "Gagal memuat plan" }, { status: 500 });
  }
}
