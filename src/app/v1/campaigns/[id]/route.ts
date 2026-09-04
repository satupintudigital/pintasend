import { verifyApiKey } from "@/lib/authStore";
import { getCampaignDetail } from "@/lib/campaigns";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Detail campaign + progress per penerima (maks 1000 baris terakhir).
//   GET /v1/campaigns/:id

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json(
      { error: "API key tidak valid atau telah dicabut" },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const { id } = await params;
  if (!id?.trim()) {
    return Response.json({ error: "id wajib diisi" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const detail = await getCampaignDetail(id.trim(), verified.tenantId);
  if (!detail) {
    return Response.json({ error: "Campaign tidak ditemukan" }, { status: 404, headers: { "x-request-id": requestId } });
  }
  return Response.json({ ok: true, campaign: detail }, { headers: { "x-request-id": requestId } });
}
