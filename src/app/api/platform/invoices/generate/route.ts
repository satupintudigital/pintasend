import { auth } from "@/lib/auth";
import { generateMonthlyInvoices } from "@/lib/invoices";
import { isValidPeriod } from "@/lib/monthPeriod";
import { recordAuditFromSession } from "@/lib/audit";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
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

// Generate invoice bulan tertentu (idempoten) — khusus platform_admin.
// Body: { year, month }.
export async function POST(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const rl = await checkRateLimit(`invoice-generate:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as {
    year?: unknown;
    month?: unknown;
  } | null;
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!isValidPeriod(year, month)) {
    return Response.json({ error: "Periode tidak valid (year 2020..2100, month 1..12)" }, { status: 400 });
  }

  try {
    const { created, skipped } = await generateMonthlyInvoices(year, month);
    await recordAuditFromSession(session, {
      tenantId: null,
      action: "invoice.generate",
      targetType: "invoice",
      targetId: `${year}-${String(month).padStart(2, "0")}`,
      meta: { year, month, created, skipped },
    });
    return Response.json({ ok: true, created, skipped, year, month });
  } catch (e) {
    console.error("platform/invoices/generate:", e);
    return Response.json({ error: "Gagal generate invoice" }, { status: 500 });
  }
}
