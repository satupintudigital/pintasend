import { auth } from "@/lib/auth";
import { listAuditLogs } from "@/lib/audit";
import {
  isPlatformAdmin,
  parsePrincipal,
  unauthorized,
  forbidden,
  type SessionLike,
} from "@/lib/abac";

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

// Daftar audit log lintas-tenant — khusus platform_admin.
// Query params: action, tenantId, actorEmail, from, to, q, page, limit.
export async function GET(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "25");
  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit harus 1..100" }, { status: 400 });
  }

  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  if (from && Number.isNaN(Date.parse(from))) {
    return Response.json({ error: "from bukan tanggal valid" }, { status: 400 });
  }
  if (to && Number.isNaN(Date.parse(to))) {
    return Response.json({ error: "to bukan tanggal valid" }, { status: 400 });
  }

  try {
    const res = await listAuditLogs({
      action: url.searchParams.get("action") ?? undefined,
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      actorEmail: url.searchParams.get("actorEmail") ?? undefined,
      from,
      to,
      q: url.searchParams.get("q") ?? undefined,
      page: Math.floor(page),
      limit: Math.floor(limit),
    });
    return Response.json({ ...res, page: Math.floor(page), limit: Math.floor(limit) });
  } catch (e) {
    console.error("platform/audit GET:", e);
    return Response.json({ error: "Gagal memuat audit log" }, { status: 500 });
  }
}
