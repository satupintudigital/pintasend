import { auth } from "@/lib/auth";
import {
  createRetentionRequest,
  getTenantRetentionDays,
  listRetentionRequests,
  MAX_MESSAGE_RETENTION_DAYS,
  DEFAULT_MESSAGE_RETENTION_DAYS,
} from "@/lib/retention";

// Retensi pesan per tenant — khusus platform_admin.
// GET  → nilai efektif + daftar permintaan (instruksi tertulis).
// POST → catat permintaan perpanjangan retensi dari tenant (status pending).

function gate(session: { user?: { role?: string } | null } | null) {
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = gate(session);
  if (denied) return denied;

  const { id } = await params;
  try {
    const [retentionDays, requests] = await Promise.all([
      getTenantRetentionDays(id),
      listRetentionRequests(id),
    ]);
    return Response.json({
      tenantId: id,
      retentionDays,
      defaultRetentionDays: DEFAULT_MESSAGE_RETENTION_DAYS,
      maxRetentionDays: MAX_MESSAGE_RETENTION_DAYS,
      requests,
    });
  } catch (e) {
    console.error("platform/tenants/[id]/retention GET:", e);
    return Response.json({ error: "Gagal memuat data retensi" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = gate(session);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    requestedBy?: unknown;
    reason?: unknown;
    retentionDays?: unknown;
  } | null;

  const requestedBy = typeof body?.requestedBy === "string" ? body.requestedBy.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const retentionDays = Number(body?.retentionDays);

  if (!requestedBy || requestedBy.length > 120) {
    return Response.json(
      { error: "Pemohon (nama/email tenant) wajib diisi, maks. 120 karakter" },
      { status: 400 },
    );
  }
  if (!reason || reason.length > 1000) {
    return Response.json(
      { error: "Instruksi tertulis/alasan wajib diisi, maks. 1000 karakter" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(retentionDays) || retentionDays < DEFAULT_MESSAGE_RETENTION_DAYS) {
    return Response.json(
      { error: `Retensi minimal ${DEFAULT_MESSAGE_RETENTION_DAYS} hari` },
      { status: 400 },
    );
  }
  if (retentionDays > MAX_MESSAGE_RETENTION_DAYS) {
    return Response.json(
      { error: `Maks. perpanjangan ${MAX_MESSAGE_RETENTION_DAYS} hari` },
      { status: 400 },
    );
  }

  try {
    const request = await createRetentionRequest({
      tenantId: id,
      requestedBy,
      reason,
      retentionDays,
    });
    return Response.json(request, { status: 201 });
  } catch (e) {
    console.error("platform/tenants/[id]/retention POST:", e);
    return Response.json({ error: "Gagal mencatat permintaan retensi" }, { status: 500 });
  }
}
