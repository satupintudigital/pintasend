import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MessageHistoryPanel } from "@/components/dashboard/MessageHistoryPanel";

// Halaman riwayat pesan — semua pengguna tenant yang sudah login.
export default async function PesanPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <MessageHistoryPanel />;
}
