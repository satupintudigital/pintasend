import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ApiKeysPanel } from "@/components/dashboard/ApiKeysPanel";

// Halaman pengaturan API key — owner-only (API juga menegakkan 403).
export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");

  return <ApiKeysPanel />;
}
