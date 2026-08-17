import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import {
  createUserWithTenant,
  EmailAlreadyExistsError,
} from "@/lib/authStore";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Register admin-only (bukan publik): hanya owner yang bisa membuat user.
// Tiap user baru = tenant sendiri. Write-through via authStore
// (Neon source of truth → clone D1) sehingga user langsung bisa login.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  const rl = await checkRateLimit(`admin-register:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    tenantName?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const tenantName =
    typeof body?.tenantName === "string" && body.tenantName.trim()
      ? body.tenantName.trim()
      : name;

  if (!name || name.length > 60) {
    return Response.json({ error: "Nama wajib diisi (maks. 60 karakter)" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return Response.json({ error: "Email tidak valid" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }
  if (tenantName.length > 80) {
    return Response.json({ error: "Nama tenant maks. 80 karakter" }, { status: 400 });
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const { id, tenantId } = await createUserWithTenant({
      tenantName,
      email,
      name,
      passwordHash,
    });
    return Response.json(
      {
        user: { id, tenantId, email, name },
        tenant: { id: tenantId, name: tenantName },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof EmailAlreadyExistsError) {
      return Response.json({ error: e.message }, { status: 409 });
    }
    // Race unik email di Neon (unique_violation 23505).
    if ((e as { code?: string })?.code === "23505") {
      return Response.json({ error: "Email sudah terdaftar" }, { status: 409 });
    }
    console.error("admin/register:", e);
    return Response.json({ error: "Gagal membuat pengguna" }, { status: 500 });
  }
}
