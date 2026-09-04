import { auth } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/authStore";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { recordAuditFromSession } from "@/lib/audit";
import {
  canManageTenantMembers,
  parsePrincipal,
  unauthorized,
  forbidden,
  type SessionLike,
} from "@/lib/abac";

function requireMemberManager(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }
  return null;
}

// Kelola API key — halaman pengaturan (owner & tenant_admin).
// - GET  → daftar key milik tenant (baca D1, 0 Neon, tanpa keyHash)
// - POST → buat key baru (raw key dikembalikan SEKALI; Neon source of truth → clone D1)
export async function GET() {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const tenantId = parsePrincipal(session)?.tenantId ?? "";

  try {
    const keys = await listApiKeys(tenantId);
    return Response.json({ keys });
  } catch (e) {
    console.error("admin/api-keys GET:", e);
    return Response.json({ error: "Gagal memuat API key" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const p = parsePrincipal(session);
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const tenantId = p?.tenantId ?? "";

  const rl = await checkRateLimit(`api-key-create:${tenantId}:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 60) {
    return Response.json({ error: "Label wajib diisi (maks. 60 karakter)" }, { status: 400 });
  }

  try {
    const key = await createApiKey({ tenantId, label });
    await recordAuditFromSession(session, {
      tenantId,
      action: "apikey.create",
      targetType: "apikey",
      targetId: key.id,
      meta: { label },
    });
    return Response.json({ key }, { status: 201 });
  } catch (e) {
    console.error("admin/api-keys POST:", e);
    return Response.json({ error: "Gagal membuat API key" }, { status: 500 });
  }
}
