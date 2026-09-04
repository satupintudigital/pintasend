import { auth } from "@/lib/auth";
import { canManageTenantMembers, parsePrincipal, unauthorized, forbidden, type SessionLike } from "@/lib/abac";
import { inviteTenantMember, listTenantMembers } from "@/lib/tenantMembers";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { recordAuditFromSession } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireMemberManager(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }
  return null;
}

// Daftar pengguna tenant (owner & tenant_admin) — baca replika D1 (auth edge).
// Query params: q, page (1-based), limit (default 10, maks 100).
export async function GET(req: Request) {
  const session = await auth();
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "10");

  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit harus 1..100" }, { status: 400 });
  }
  if (q.length > 100) {
    return Response.json({ error: "Pencarian maks. 100 karakter" }, { status: 400 });
  }

  try {
    const { users, total } = await listTenantMembers(p.tenantId, {
      q,
      page: Math.floor(page),
      limit: Math.floor(limit),
    });
    return Response.json({ users, total, page, limit });
  } catch (e) {
    console.error("admin/users GET:", e);
    return Response.json({ error: "Gagal memuat daftar pengguna" }, { status: 500 });
  }
}

// Undang user baru (member/tenant_admin) ke tenant pemilik sesi.
// Body: { name, email, password, role } — role hanya member|tenant_admin
// (invariant satu owner per tenant dijaga di service).
export async function POST(req: Request) {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const p = parsePrincipal(session) as NonNullable<ReturnType<typeof parsePrincipal>>;

  const rl = await checkRateLimit(`admin-user-create:${p.tenantId}:${clientIp(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = typeof body?.role === "string" ? body.role : "member";

  if (!name || name.length > 60) {
    return Response.json({ error: "Nama wajib diisi (maks. 60 karakter)" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return Response.json({ error: "Email tidak valid" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }
  if (password.length > 128) {
    return Response.json({ error: "Password maks. 128 karakter" }, { status: 400 });
  }

  try {
    const result = await inviteTenantMember({ tenantId: p.tenantId, name, email, password, role });
    if (!result.ok) {
      return Response.json(
        { error: result.error ?? "Gagal membuat user" },
        { status: result.status ?? 400 },
      );
    }
    await recordAuditFromSession(session, {
      tenantId: p.tenantId,
      action: "user.create",
      targetType: "user",
      targetId: result.data?.id,
      meta: { email, role },
    });
    return Response.json({ id: result.data?.id }, { status: 201 });
  } catch (e) {
    console.error("admin/users POST:", e);
    return Response.json({ error: "Gagal membuat user" }, { status: 500 });
  }
}
