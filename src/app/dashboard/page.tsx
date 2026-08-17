import { auth } from "@/lib/auth";

export default async function DashboardHome() {
  const session = await auth();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Halo, {session?.user?.name ?? session?.user?.email}. Kelola device WhatsApp dan kirim pesan lewat API Wavio.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-medium text-fg-muted">Device tersambung</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">0</p>
          <p className="mt-1 text-xs text-fg-faint">Fitur device segera hadir</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-medium text-fg-muted">Pesan bulan ini</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">0</p>
          <p className="mt-1 text-xs text-fg-faint">Fitur kirim pesan segera hadir</p>
        </div>
      </div>
    </div>
  );
}
