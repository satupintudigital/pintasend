import { auth } from "@/lib/auth";
import { getPlatformMetrics } from "@/lib/platform";

// Metrik lintas tenant — khusus platform_admin.
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  try {
    const metrics = await getPlatformMetrics();
    return Response.json({ metrics });
  } catch (e) {
    console.error("platform/metrics:", e);
    return Response.json({ error: "Gagal memuat metrik" }, { status: 500 });
  }
}
