import { verifyApiKey } from "@/lib/authStore";
import { queryOne } from "@/lib/db";
import { openwa, publicOpenwaError } from "@/lib/openwa";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Status batch broadcast (async) — baca progress dari OpenWA via device tenant.
// Auth: Authorization: Bearer <API key> (sama seperti /v1/messages).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ batchId: string }> },
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

  const { batchId } = await params;
  if (!batchId?.trim()) {
    return Response.json(
      { error: "batchId wajib diisi" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  // Batch dibuat via device tenant — resolve device ready tenant (batch tidak
  // menyimpan deviceId; pakai device ready pertama seperti saat kirim).
  const device = await queryOne<{ id: string; openwaSessionId: string }>(
    'SELECT id, "openwaSessionId" FROM "Device" WHERE "tenantId" = $1 AND status = $2 ORDER BY "updatedAt" DESC LIMIT 1',
    [verified.tenantId, "ready"],
  );
  if (!device) {
    return Response.json(
      { error: "Belum ada device yang tersambung (status ready)" },
      { status: 404, headers: { "x-request-id": requestId } },
    );
  }

  try {
    const batch = await openwa.getBatchStatus(device.openwaSessionId, batchId);
    return Response.json({ batch }, { headers: { "x-request-id": requestId } });
  } catch (e) {
    logEvent("error", "batch_status_failed", requestId, {
      tenantId: verified.tenantId,
      batchId,
      detail: e instanceof Error ? e.message : String(e),
    });
    return Response.json(
      { error: publicOpenwaError(e, "v1/messages/batch") },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}
