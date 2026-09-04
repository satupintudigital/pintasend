import { auth } from "@/lib/auth";
import { createUser, listUsersPaginated } from "@/lib/authStore";
import { sendWelcomeEmail } from "@/lib/email";
import { checkUserQuota } from "@/lib/quota";
import { recordAuditFromSession } from "@/lib/audit";
import bcrypt from "bcryptjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Daftar user tenant — khusus platform_admin (via GET /tenants/[id] juga bisa,
// tapi endpoint terpisah ini memungkinkan pagination di masa depan).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }
  const { id } = await params;
  const { users, total } = await listUsersPaginated({ limit: 100, tenantId: id });
  return Response.json({ users, total });
}

// Tambah user ke tenant — khusus platform_admin. Hard block saat kuota user penuh.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }
  const { id } = await params;

  const quota = await checkUserQuota(id);
  if (!quota.ok) {
    return Response.json(
      { error: `Kuota user tenant tercapai (${quota.used}/${quota.max}).` },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  // User baru via jalur ini hanya member | tenant_admin (owner dibuat via
  // provisioning POST /api/platform/tenants — invariant satu owner per tenant).
  const role = body?.role === "tenant_admin" ? "tenant_admin" : "member";

  if (!name || name.length > 60) {
    return Response.json({ error: "Nama wajib diisi (maks. 60 karakter)" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return Response.json({ error: "Email tidak valid" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const { id: userId } = await createUser({
      tenantId: id,
      email,
      name,
      passwordHash,
      role,
    });
    // Email welcome (never-throw helper) — kegagalan kirim tidak menggagalkan
    // pembuatan user; tanpa RESEND_API_KEY otomatis di-skip.
    await sendWelcomeEmail({ email, name });
    await recordAuditFromSession(session, {
      tenantId: id,
      action: "user.create",
      targetType: "user",
      targetId: userId,
      meta: { email, role, by: "platform" },
    });
    return Response.json({ id: userId }, { status: 201 });
  } catch (e) {
    console.error("platform/tenants/[id]/users POST:", e);
    return Response.json(
      { error: "Gagal membuat user (email mungkin sudah terdaftar)" },
      { status: 409 },
    );
  }
}
