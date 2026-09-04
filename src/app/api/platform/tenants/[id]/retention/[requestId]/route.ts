import { auth } from "@/lib/auth";
import { approveRetentionRequest, rejectRetentionRequest } from "@/lib/retention";

// Proses permintaan perpanjangan retensi — khusus platform_admin.
// POST { action: "approve" | "reject" }.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { requestId } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  const actor = session.user.email ?? session.user.name ?? "platform_admin";

  if (action !== "approve" && action !== "reject") {
    return Response.json(
      { error: "Field action wajib 'approve' atau 'reject'" },
      { status: 400 },
    );
  }

  try {
    const result =
      action === "approve"
        ? await approveRetentionRequest(requestId, actor)
        : await rejectRetentionRequest(requestId, actor);
    if (!result.ok) {
      return Response.json({ error: result.reason ?? "Gagal memproses" }, { status: 400 });
    }
    return Response.json({ ok: true, action });
  } catch (e) {
    console.error("platform/tenants/[id]/retention/[requestId]:", e);
    return Response.json({ error: "Gagal memproses permintaan retensi" }, { status: 500 });
  }
}
