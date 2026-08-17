import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PenggunaForm } from "@/components/dashboard/PenggunaForm";
import { PenggunaList } from "@/components/dashboard/PenggunaList";

// Role gate server-side: halaman ini hanya untuk owner. (API juga menegakkan
// 403 — ini lapisan UX agar member tidak melihat form yang pasti gagal.)
// Daftar pengguna di-fetch client-side oleh <PenggunaList> dari
// GET /api/admin/users (baca replika D1, 0 koneksi Neon) agar pencarian &
// pagination tidak me-refresh seluruh halaman.
export default async function PenggunaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");

  return (
    <div className="space-y-8">
      <PenggunaForm />
      <PenggunaList />
    </div>
  );
}
