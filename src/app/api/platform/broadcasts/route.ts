import { auth } from "@/lib/auth";
import { createPlatformBroadcast, listPlatformBroadcasts } from "@/lib/platformBroadcast";
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

// Daftar broadcast platform — khusus platform_admin.
export async function GET(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    return Response.json({ error: "limit harus 1..50" }, { status: 400 });
  }

  try {
    const { items, total } = await listPlatformBroadcasts({
      page: Math.floor(page),
      limit: Math.floor(limit),
    });
    return Response.json({ broadcasts: items, total, page: Math.floor(page), limit: Math.floor(limit) });
  } catch (e) {
    console.error("platform/broadcasts GET:", e);
    return Response.json({ error: "Gagal memuat broadcast" }, { status: 500 });
  }
}

// Buat broadcast (draft) — khusus platform_admin. Start dilakukan terpisah
// (POST /[id] {action:"start"}) agar draft bisa direview dulu.
export async function POST(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    messageBody?: unknown;
    targetMode?: unknown;
    tenantIds?: unknown;
    scheduledAt?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const messageBody = typeof body?.messageBody === "string" ? body.messageBody.trim() : "";
  const targetMode = body?.targetMode === "tenant_ids" ? "tenant_ids" : "ready_devices";
  const rawTenantIds = Array.isArray(body?.tenantIds)
    ? (body.tenantIds as unknown[]).filter((t): t is string => typeof t === "string")
    : [];

  if (!name || name.length > 120) {
    return Response.json({ error: "Nama wajib diisi (maks. 120 karakter)" }, { status: 400 });
  }
  if (!messageBody || messageBody.length > 4096) {
    return Response.json({ error: "Isi pesan wajib diisi (maks. 4096 karakter)" }, { status: 400 });
  }
  if (targetMode === "tenant_ids" && rawTenantIds.length === 0) {
    return Response.json(
      { error: "targetMode tenant_ids butuh minimal satu tenantId" },
      { status: 400 },
    );
  }

  const principal = parsePrincipal(session);
  try {
    const { id } = await createPlatformBroadcast(
      {
        name,
        messageBody,
        targetMode,
        tenantIds: rawTenantIds,
        scheduledAt: typeof body?.scheduledAt === "string" ? body.scheduledAt : null,
      },
      { email: principal?.email ?? principal?.id ?? "platform" },
    );
    await recordAuditFromSession(session, {
      tenantId: null,
      action: "broadcast.create",
      targetType: "broadcast",
      targetId: id,
      meta: { name, targetMode },
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    console.error("platform/broadcasts POST:", e);
    return Response.json({ error: "Gagal membuat broadcast" }, { status: 500 });
  }
}
