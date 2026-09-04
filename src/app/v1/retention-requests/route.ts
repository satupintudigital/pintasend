import { verifyApiKey } from "@/lib/authStore";
import {
  createRetentionRequest,
  getTenantRetentionDays,
  hasPendingRetentionRequest,
  listRetentionRequests,
  DEFAULT_MESSAGE_RETENTION_DAYS,
  MAX_MESSAGE_RETENTION_DAYS,
} from "@/lib/retention";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API pihak ketiga (tenant): permintaan perpanjangan retensi pesan.
// Auth: Authorization: Bearer <API key>. Route THIN — delegasi ke lib/retention.
//
// POST /v1/retention-requests — catat permintaan (status pending, menunggu
//   persetujuan platform admin). Dasar: DPA §5.7 ("kecuali Tenant meminta
//   penyimpanan lebih lama").
// GET  /v1/retention-requests — nilai retensi efektif + riwayat permintaan
//   tenant (dipakai dashboard untuk menampilkan status).

export async function POST(req: Request) {
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
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId });

  let body: { reason?: unknown; retentionDays?: unknown } | null;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Body harus berupa JSON" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const retentionDays = Number(body?.retentionDays);

  if (!reason || reason.length > 1000) {
    return Response.json(
      { error: "Instruksi tertulis/alasan wajib diisi, maks. 1000 karakter" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < DEFAULT_MESSAGE_RETENTION_DAYS ||
    retentionDays > MAX_MESSAGE_RETENTION_DAYS
  ) {
    return Response.json(
      {
        error: `retentionDays harus angka ${DEFAULT_MESSAGE_RETENTION_DAYS}..${MAX_MESSAGE_RETENTION_DAYS}`,
      },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  try {
    const hasPending = await hasPendingRetentionRequest(verified.tenantId);
    if (hasPending) {
      return Response.json(
        { error: "Sudah ada permintaan yang menunggu persetujuan" },
        { status: 409, headers: { "x-request-id": requestId } },
      );
    }

    const request = await createRetentionRequest({
      tenantId: verified.tenantId,
      // Identitas pemohon = API key yang dipakai (bukan input bebas) —
      // requestedBy diisi label API key? Tidak tersedia di sini; pakai
      // keyId sebagai identitas teknis, admin platform yang memverifikasi.
      requestedBy: `api-key:${verified.keyId}`,
      reason,
      retentionDays,
    });
    return Response.json(request, {
      status: 201,
      headers: { "x-request-id": requestId },
    });
  } catch (e) {
    console.error("v1/retention-requests POST:", e);
    return Response.json(
      { error: "Gagal mencatat permintaan retensi" },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}

export async function GET(req: Request) {
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

  try {
    const [retentionDays, requests] = await Promise.all([
      getTenantRetentionDays(verified.tenantId),
      listRetentionRequests(verified.tenantId),
    ]);
    return Response.json(
      {
        retentionDays,
        defaultRetentionDays: DEFAULT_MESSAGE_RETENTION_DAYS,
        maxRetentionDays: MAX_MESSAGE_RETENTION_DAYS,
        requests,
      },
      { headers: { "x-request-id": requestId } },
    );
  } catch (e) {
    console.error("v1/retention-requests GET:", e);
    return Response.json(
      { error: "Gagal memuat data retensi" },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
