import { auth } from "@/lib/auth";
import { markInvoicePaid, voidInvoice } from "@/lib/invoices";
import { recordAuditFromSession } from "@/lib/audit";
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

// Aksi invoice: void | mark_paid — khusus platform_admin.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "void" && action !== "mark_paid") {
    return Response.json({ error: 'action harus "void" atau "mark_paid"' }, { status: 400 });
  }

  try {
    const res =
      action === "void"
        ? await voidInvoice(id)
        : await markInvoicePaid(id);
    if (!res.ok) {
      return Response.json({ error: res.reason ?? "Gagal memproses" }, { status: 400 });
    }
    await recordAuditFromSession(session, {
      tenantId: null,
      action: action === "void" ? "invoice.void" : "invoice.mark_paid",
      targetType: "invoice",
      targetId: id,
    });
    return Response.json({ ok: true, action });
  } catch (e) {
    console.error("platform/invoices/[id]:", e);
    return Response.json({ error: "Gagal memproses invoice" }, { status: 500 });
  }
}
