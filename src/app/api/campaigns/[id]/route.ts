import { auth } from "@/lib/auth";
import { getCampaignDetail } from "@/lib/campaigns";

// Dashboard — detail campaign + progress per penerima.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const campaign = await getCampaignDetail(id?.trim() ?? "", tenantId);
    if (!campaign) return Response.json({ error: "Campaign tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true, campaign });
  } catch (e) {
    console.error("campaigns/[id] GET:", e);
    return Response.json({ error: "Gagal memuat campaign" }, { status: 500 });
  }
}
