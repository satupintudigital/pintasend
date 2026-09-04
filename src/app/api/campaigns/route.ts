import { auth } from "@/lib/auth";
import { createCampaign, listCampaigns, tenantHasCampaignAddon } from "@/lib/campaigns";

// Dashboard — modul Campaign.
//   GET  → daftar campaign + statistik (+ addonActive utk gating UI)
//   POST → buat draft campaign

export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [campaigns, addonActive] = await Promise.all([listCampaigns(tenantId), tenantHasCampaignAddon(tenantId)]);
    return Response.json({ ok: true, campaigns, addonActive });
  } catch (e) {
    console.error("campaigns GET:", e);
    return Response.json({ error: "Gagal memuat campaign" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  try {
    const result = await createCampaign(
      {
        name: typeof body.name === "string" ? body.name : "",
        messageBody: typeof body.messageBody === "string" ? body.messageBody : "",
        ...(typeof body.deviceId === "string" && body.deviceId.trim() ? { deviceId: body.deviceId.trim() } : {}),
        ...(typeof body.mediaType === "string" && typeof body.mediaUrl === "string"
          ? { mediaType: body.mediaType, mediaUrl: body.mediaUrl }
          : {}),
        ...(typeof body.filename === "string" ? { filename: body.filename } : {}),
        ...(typeof body.audienceTag === "string" && body.audienceTag.trim()
          ? { audienceTag: body.audienceTag.trim() }
          : { audienceTag: null }),
        ...(typeof body.minDelaySec === "number" ? { minDelaySec: body.minDelaySec } : {}),
        ...(typeof body.maxDelaySec === "number" ? { maxDelaySec: body.maxDelaySec } : {}),
        ...(typeof body.scheduledAt === "string" && body.scheduledAt.trim()
          ? { scheduledAt: body.scheduledAt }
          : { scheduledAt: null }),
      },
      // keyId tidak dipakai jalur dashboard (rate limit per key hanya di API publik).
      { tenantId, keyId: `session:${session.user.id ?? "owner"}`, requestId: crypto.randomUUID() },
    );
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    console.error("campaigns POST:", e);
    return Response.json({ error: "Gagal membuat campaign" }, { status: 500 });
  }
}
