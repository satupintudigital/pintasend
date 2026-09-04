import { verifyApiKey } from "@/lib/authStore";
import {
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
} from "@/lib/campaigns";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Transisi status campaign:
//   POST /v1/campaigns/:id/start   → draft/paused → running|scheduled
//   POST /v1/campaigns/:id/pause   → running/scheduled → paused
//   POST /v1/campaigns/:id/resume  → paused → running
//   POST /v1/campaigns/:id/cancel  → apa pun (belum berakhir) → cancelled

const ACTIONS = { start: startCampaign, pause: pauseCampaign, resume: resumeCampaign, cancel: cancelCampaign } as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
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

  const { id, action } = await params;
  const handler = ACTIONS[action as keyof typeof ACTIONS];
  if (!id?.trim() || !handler) {
    return Response.json(
      { error: "Aksi tidak dikenal. Gunakan start | pause | resume | cancel" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const result = await handler(id.trim(), {
    tenantId: verified.tenantId,
    keyId: verified.keyId,
    requestId,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status, headers: { "x-request-id": requestId } });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}
