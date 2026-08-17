import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { updateUserPassword } from "@/lib/authStore";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

// Reset password pengguna dari halaman admin — owner-only.
// Write-through via authStore: Neon source of truth → clone D1,
// sehingga login (yang baca D1) langsung memakai password baru.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  const rl = await checkRateLimit(`admin-password:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }
  if (password.length > 128) {
    return Response.json({ error: "Password maks. 128 karakter" }, { status: 400 });
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await updateUserPassword(id, passwordHash);
    if (!result.updated) {
      return Response.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
    }
    return Response.json({ ok: true, d1Ok: result.d1Ok });
  } catch (e) {
    console.error("admin/users/[id]/password:", e);
    return Response.json({ error: "Gagal mereset password" }, { status: 500 });
  }
}
