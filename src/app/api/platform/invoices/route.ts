import { auth } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices";
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

// Daftar invoice — khusus platform_admin. Filter: tenantId, status, year+month.
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

  const yearRaw = url.searchParams.get("year");
  const monthRaw = url.searchParams.get("month");

  try {
    const { invoices, total } = await listInvoices({
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      year: yearRaw ? Number(yearRaw) : undefined,
      month: monthRaw ? Number(monthRaw) : undefined,
      page: Math.floor(page),
      limit: Math.floor(limit),
    });
    return Response.json({ invoices, total, page: Math.floor(page), limit: Math.floor(limit) });
  } catch (e) {
    console.error("platform/invoices GET:", e);
    return Response.json({ error: "Gagal memuat invoice" }, { status: 500 });
  }
}
