import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantHasCampaignAddon } from "@/lib/campaigns";
import { CampaignPanel } from "@/components/dashboard/CampaignPanel";

// Halaman modul WA Campaign — owner-only.
export default async function CampaignPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");
  const hasAddon = session.user.tenantId
    ? await tenantHasCampaignAddon(session.user.tenantId).catch(() => false)
    : false;

  return <CampaignPanel hasAddon={hasAddon} />;
}
