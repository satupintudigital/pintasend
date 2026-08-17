import { auth } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/authStore";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

// Kelola API key — halaman pengaturan (owner-only).
// - GET  → daftar key milik tenant (baca D1, 0 Neon, tanpa keyHash)
// - POST → buat key baru (raw key dikembalikan SEKALI; Neon source of truth → clone D1)
export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const keys = await listApiKeys(tenantId);
    return Response.json({ keys });
  } catch (e) {
    console.error("admin/api-keys GET:", e);
    return Response.json({ error: "Gagal memuat API key" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  const rl = await checkRateLimit(`api-key-create:${tenantId}:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 60) {
    return Response.json({ error: "Label wajib diisi (maks. 60 karakter)" }, { status: 400 });
  }

  try {
    const key = await createApiKey({ tenantId, label });
    return Response.json({ key }, { status: 201 });
  } catch (e) {
    console.error("admin/api-keys POST:", e);
    return Response.json({ error: "Gagal membuat API key" }, { status: 500 });
  }
}
