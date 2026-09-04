import { auth } from "@/lib/auth";
import {
  cancelPlatformBroadcast,
  getPlatformBroadcast,
  startPlatformBroadcast,
} from "@/lib/platformBroadcast";
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

// Detail broadcast + ringkasan job per status.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  try {
    const bc = await getPlatformBroadcast(id);
    if (!bc) return Response.json({ error: "Broadcast tidak ditemukan" }, { status: 404 });
    return Response.json({ broadcast: bc });
  } catch (e) {
    console.error("platform/broadcasts/[id] GET:", e);
    return Response.json({ error: "Gagal memuat broadcast" }, { status: 500 });
  }
}

// Start (draft → snapshot job) / cancel (running) broadcast.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "start" && action !== "cancel") {
    return Response.json({ error: 'action harus "start" atau "cancel"' }, { status: 400 });
  }

  try {
    if (action === "start") {
      const res = await startPlatformBroadcast(id);
      if (!res.ok) {
        return Response.json({ error: res.reason ?? "Gagal start" }, { status: 400 });
      }
      await recordAuditFromSession(session, {
        tenantId: null,
        action: "broadcast.start",
        targetType: "broadcast",
        targetId: id,
        meta: { jobs: res.jobs ?? 0 },
      });
      return Response.json({ ok: true, jobs: res.jobs });
    }
    const res = await cancelPlatformBroadcast(id);
    if (!res.ok) {
      return Response.json({ error: res.reason ?? "Gagal cancel" }, { status: 400 });
    }
    await recordAuditFromSession(session, {
      tenantId: null,
      action: "broadcast.cancel",
      targetType: "broadcast",
      targetId: id,
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("platform/broadcasts/[id] POST:", e);
    return Response.json({ error: "Gagal memproses broadcast" }, { status: 500 });
  }
}
