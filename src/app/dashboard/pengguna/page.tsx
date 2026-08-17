import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PenggunaForm } from "@/components/dashboard/PenggunaForm";

// Role gate server-side: halaman ini hanya untuk owner. (API juga menegakkan
// 403 — ini lapisan UX agar member tidak melihat form yang pasti gagal.)
export default async function PenggunaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");

  return <PenggunaForm />;
}
