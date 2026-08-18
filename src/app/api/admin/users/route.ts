import { auth } from "@/lib/auth";
import { listUsersPaginated } from "@/lib/authStore";

// Daftar pengguna utk halaman admin — owner-only.
// Baca replika D1 (auth edge), 0 koneksi Neon; konsisten dengan jalur login.
// Query params: q (pencarian name/email), page (1-based), limit (default 10, maks 100).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "10");

  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit harus 1..100" }, { status: 400 });
  }
  if (query.length > 100) {
    return Response.json({ error: "Pencarian maks. 100 karakter" }, { status: 400 });
  }

  try {
    // Scope ke tenant pemilik sesi: owner hanya melihat user tenant-nya sendiri
    // (menutup kebocoran data lintas tenant; daftar lintas tenant hanya di
    // /api/platform/* untuk platform_admin).
    const { users, total } = await listUsersPaginated({
      query,
      page: Math.floor(page),
      limit: Math.floor(limit),
      tenantId: session.user.tenantId,
    });
    return Response.json({ users, total, page, limit });
  } catch (e) {
    console.error("admin/users:", e);
    return Response.json({ error: "Gagal memuat daftar pengguna" }, { status: 500 });
  }
}
