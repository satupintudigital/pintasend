import { auth } from "@/lib/auth";
import {
  createUserWithTenant,
  EmailAlreadyExistsError,
} from "@/lib/authStore";
import { listTenants } from "@/lib/platform";
import { sendWelcomeEmail } from "@/lib/email";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function forbidden() {
  return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
}

function requirePlatformAdmin(session: { user?: { role?: string } | null } | null) {
  if (!session?.user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "platform_admin") return { error: forbidden() };
  return { error: null as Response | null };
}

// Daftar tenant + statistik — khusus platform_admin.
export async function GET(req: Request) {
  const session = await auth();
  const gate = requirePlatformAdmin(session);
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit harus 1..100" }, { status: 400 });
  }
  if (q.length > 100) return Response.json({ error: "q maks. 100 karakter" }, { status: 400 });

  try {
    const { tenants, total } = await listTenants({ q, page, limit });
    return Response.json({ tenants, total, page, limit });
  } catch (e) {
    console.error("platform/tenants GET:", e);
    return Response.json({ error: "Gagal memuat daftar tenant" }, { status: 500 });
  }
}

// Provisioning: buat tenant + owner user. Khusus platform_admin (spec §4.3) —
// tenant owner TIDAK lagi bisa membuat akun baru.
export async function POST(req: Request) {
  const session = await auth();
  const gate = requirePlatformAdmin(session);
  if (gate.error) return gate.error;

  const rl = await checkRateLimit(`platform-register:${clientIp(req)}`, 10, 60_000);
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
    // Email welcome (never-throw helper) — kegagalan kirim tidak menggagalkan
    // provisioning; tanpa RESEND_API_KEY otomatis di-skip.
    await sendWelcomeEmail({ email, name });
    return Response.json({ id, tenantId }, { status: 201 });
  } catch (e) {
    if (e instanceof EmailAlreadyExistsError) {
      return Response.json({ error: "Email sudah terdaftar" }, { status: 409 });
    }
    console.error("platform/tenants POST:", e);
    return Response.json({ error: "Gagal membuat tenant" }, { status: 500 });
  }
}
