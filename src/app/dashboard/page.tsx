import Link from "next/link";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export default async function DashboardHome() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;

  let deviceCount = 0;
  if (tenantId) {
    const rows = await query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "Device" WHERE "tenantId" = $1',
      [tenantId],
    );
    deviceCount = rows[0]?.count ?? 0;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Halo, {session?.user?.name ?? session?.user?.email}. Kelola device WhatsApp dan kirim pesan lewat API Wavio.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/devices"
          className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
        >
          <h2 className="text-sm font-medium text-fg-muted">Device terhubung</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{deviceCount}</p>
          <p className="mt-1 text-xs text-fg-faint transition-colors group-hover:text-accent">
            Kelola device → buka halaman Device
          </p>
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-medium text-fg-muted">Pesan bulan ini</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">0</p>
          <p className="mt-1 text-xs text-fg-faint">Fitur kirim pesan segera hadir</p>
        </div>
      </div>
    </div>
  );
}
