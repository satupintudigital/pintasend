import { auth } from "@/lib/auth";
import { listAuditLogs, toAuditCsv } from "@/lib/audit";
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

// Export audit log ke CSV — khusus platform_admin (admin UI, tanpa HMAC).
// Export memakai filter yang sama dengan GET list; dibatasi 10.000 baris
// terbaru agar respons tetap ringan.
export async function GET(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  try {
    const { logs } = await listAuditLogs({
      action: url.searchParams.get("action") ?? undefined,
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      actorEmail: url.searchParams.get("actorEmail") ?? undefined,
      from,
      to,
      q: url.searchParams.get("q") ?? undefined,
      page: 1,
      limit: 10_000,
    });
    const csv = toAuditCsv(logs);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="audit-log.csv"',
      },
    });
  } catch (e) {
    console.error("platform/audit export:", e);
    return Response.json({ error: "Gagal mengekspor audit log" }, { status: 500 });
  }
}
