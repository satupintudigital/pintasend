import { auth } from "@/lib/auth";
import { cancelCampaign, pauseCampaign, resumeCampaign, startCampaign } from "@/lib/campaigns";

// Dashboard — transisi status campaign: start | pause | resume | cancel.

const ACTIONS = { start: startCampaign, pause: pauseCampaign, resume: resumeCampaign, cancel: cancelCampaign } as const;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await params;
  const handler = ACTIONS[action as keyof typeof ACTIONS];
  if (!id?.trim() || !handler) {
    return Response.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  }

  try {
    const result = await handler(id.trim(), {
      tenantId,
      keyId: `session:${session.user.id ?? "owner"}`,
      requestId: crypto.randomUUID(),
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    console.error("campaigns/[id]/[action] POST:", e);
    return Response.json({ error: "Gagal menjalankan aksi campaign" }, { status: 500 });
  }
}
