import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantHasCampaignAddon } from "@/lib/campaigns";
import { ContactsPanel } from "@/components/dashboard/ContactsPanel";

// Halaman kontak audiens modul Campaign — owner-only.
export default async function KontakPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "owner") redirect("/dashboard");
  const hasAddon = session.user.tenantId
    ? await tenantHasCampaignAddon(session.user.tenantId).catch(() => false)
    : false;

  return <ContactsPanel hasAddon={hasAddon} />;
}
