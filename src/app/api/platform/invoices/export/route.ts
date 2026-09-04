import { auth } from "@/lib/auth";
import { exportInvoicesCsv, listInvoices } from "@/lib/invoices";
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

// Export invoice → CSV (filter sama dengan GET list, dibatasi 10.000 baris).
export async function GET(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const monthRaw = url.searchParams.get("month");

  try {
    const { invoices } = await listInvoices({
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      year: yearRaw ? Number(yearRaw) : undefined,
      month: monthRaw ? Number(monthRaw) : undefined,
      page: 1,
      limit: 10_000,
    });
    const csv = exportInvoicesCsv(invoices);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="invoices.csv"',
      },
    });
  } catch (e) {
    console.error("platform/invoices/export:", e);
    return Response.json({ error: "Gagal mengekspor invoice" }, { status: 500 });
  }
}
