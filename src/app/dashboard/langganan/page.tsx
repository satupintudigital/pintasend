import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SubscriptionDashboard } from "@/components/dashboard/SubscriptionDashboard";

export default async function LanggananPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <SubscriptionDashboard />;
}