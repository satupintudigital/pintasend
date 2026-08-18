import { auth } from "@/lib/auth";
import { updateUserPassword } from "@/lib/authStore";
import bcrypt from "bcryptjs";

// Reset password user — khusus platform_admin. Write-through Neon → D1.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = await updateUserPassword(id, passwordHash);
  if (!result.updated) return Response.json({ error: "User tidak ditemukan" }, { status: 404 });
  return Response.json({ ok: true, d1Ok: result.d1Ok });
}
