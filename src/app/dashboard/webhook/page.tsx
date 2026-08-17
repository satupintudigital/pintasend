import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WebhookPanel } from "@/components/dashboard/WebhookPanel";

// Halaman pengaturan webhook — owner-only (API juga menegakkan 403).
export default async function WebhookPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");

  return <WebhookPanel />;
}
