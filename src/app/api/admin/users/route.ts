import { auth } from "@/lib/auth";
import { listUsers } from "@/lib/authStore";

// Daftar pengguna utk halaman admin — owner-only.
// Baca replika D1 (auth edge), 0 koneksi Neon; konsisten dengan jalur login.
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") {
    return Response.json({ error: "Forbidden — hanya owner" }, { status: 403 });
  }

  try {
    const users = await listUsers();
    return Response.json({ users });
  } catch (e) {
    console.error("admin/users:", e);
    return Response.json({ error: "Gagal memuat daftar pengguna" }, { status: 500 });
  }
}
