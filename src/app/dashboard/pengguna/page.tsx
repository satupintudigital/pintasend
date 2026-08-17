import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listUsers } from "@/lib/authStore";
import { PenggunaForm } from "@/components/dashboard/PenggunaForm";
import { PenggunaList } from "@/components/dashboard/PenggunaList";

// Role gate server-side: halaman ini hanya untuk owner. (API juga menegakkan
// 403 — ini lapisan UX agar member tidak melihat form yang pasti gagal.)
export default async function PenggunaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");

  // Daftar user dibaca dari replika D1 (0 koneksi Neon), konsisten dgn login.
  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let loadError = "";
  try {
    users = await listUsers();
  } catch (e) {
    // Jangan biarkan tampak "0 akun" saat D1 bermasalah — admin butuh tahu.
    console.error("pengguna page: gagal baca daftar user dari D1", e);
    loadError = "D1 tidak dapat diakses";
  }

  return (
    <div className="space-y-8">
      <PenggunaForm />
      <PenggunaList users={users} loadError={loadError} />
    </div>
  );
}
