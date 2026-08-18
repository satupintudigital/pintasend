import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { TenantForm } from "@/components/platform/TenantForm";

export default function PlatformTenantsNew() {
  return (
    <div>
      <Link
        href="/platform/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={15} />
        Kembali ke daftar tenant
      </Link>
      <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        Provisioning
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Buat Tenant Baru
      </h1>
      <p className="mt-2 max-w-[52ch] text-sm text-fg-muted">
        Akun baru langsung aktif: tenant dibuat di Neon, di-clone ke D1 (auth edge), dan
        owner-nya bisa langsung login.
      </p>

      <div className="mt-8 max-w-xl">
        <TenantForm />
      </div>
    </div>
  );
}
