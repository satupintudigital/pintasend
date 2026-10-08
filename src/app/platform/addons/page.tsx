import { listAddons } from "@/lib/platform";
import { AddonsTable } from "@/components/platform/AddonsTable";

export const dynamic = 'force-dynamic';
export default async function PlatformAddons() {
  const addons = await listAddons();
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Platform</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Addon
      </h1>
      <p className="mt-2 max-w-[60ch] text-sm text-fg-muted">
        Kelola katalog addon yang dijual (harga, nama, aktif/arsip). Nonaktif langsung
        menyembunyikannya dari halaman harga & checkout tanpa mencabut tenant yang sudah membeli.
      </p>
      <div className="mt-8">
        <AddonsTable initial={addons} />
      </div>
    </div>
  );
}
