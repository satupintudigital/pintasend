import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { getTenantDetail, listPlans } from "@/lib/platform";
import { listUsersPaginated } from "@/lib/authStore";
import { TenantDetailPanel } from "@/components/platform/TenantDetailPanel";

export default async function PlatformTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tenant, plans, userPage] = await Promise.all([
    getTenantDetail(id),
    listPlans(),
    listUsersPaginated({ limit: 100, tenantId: id }),
  ]);
  if (!tenant) notFound();

  return (
    <div>
      <Link
        href="/platform/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={15} />
        Kembali ke daftar tenant
      </Link>
      <TenantDetailPanel
        tenantId={tenant.id}
        initial={{ tenant, plans, users: userPage.users, userTotal: userPage.total }}
      />
    </div>
  );
}
