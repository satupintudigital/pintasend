import Link from "next/link";
import { Plus } from "@phosphor-icons/react/ssr";
import { TenantTable } from "@/components/platform/TenantTable";

export default function PlatformTenants() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Platform
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Kelola Tenant
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Semua tenant PintaSend dengan statistik pemakaian.
          </p>
        </div>
        <Link
          href="/platform/tenants/new"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" />
          Buat Tenant
        </Link>
      </div>

      <div className="mt-8">
        <TenantTable />
      </div>
    </div>
  );
}
