import Link from "next/link";
import { ArrowRight, Devices, Lightning, QrCode, Waveform } from "@phosphor-icons/react/ssr";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { Spotlight } from "@/components/Spotlight";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

const steps = [
  {
    icon: Devices,
    title: "Buat device",
    desc: "Beri nama — mis. HP Kasir atau WA Marketing.",
  },
  {
    icon: QrCode,
    title: "Scan QR",
    desc: "Tautkan nomor WhatsApp lewat Perangkat Tertaut.",
  },
  {
    icon: Lightning,
    title: "Kirim pesan",
    desc: "Pakai API atau inbox langsung dari dashboard.",
  },
];

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

  const name = session?.user?.name ?? session?.user?.email ?? "pengguna";
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Dashboard</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          {greeting()}, {name.split(" ")[0]}.
        </h1>
        <p className="font-mono text-xs text-fg-faint">{date}</p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Spotlight className="bk-lift rounded-2xl border border-line bg-surface hover:border-accent/30">
          <Link
            href="/dashboard/devices"
            className="group flex h-full flex-col p-6"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
                <Devices size={20} />
              </span>
              <ArrowRight
                size={16}
                className="text-fg-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent-bright"
              />
            </div>
            <p className="mt-6 text-sm font-medium text-fg-muted">Device terhubung</p>
            <p className="bk-tabular mt-1 font-display text-4xl font-semibold tracking-tight">
              {deviceCount}
            </p>
            <p className="mt-2 text-xs text-fg-faint">
              {deviceCount === 0 ? "Belum ada device — mulai dari sini" : "Kelola device → buka halaman Device"}
            </p>
          </Link>
        </Spotlight>

        <Spotlight className="bk-lift rounded-2xl border border-line bg-surface hover:border-accent/30">
          <div className="flex h-full flex-col p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
              <Waveform size={20} />
            </span>
            <p className="mt-6 text-sm font-medium text-fg-muted">Pesan bulan ini</p>
            <p className="bk-tabular mt-1 font-display text-4xl font-semibold tracking-tight">0</p>
            <p className="mt-2 text-xs text-fg-faint">Fitur kirim pesan segera hadir</p>
          </div>
        </Spotlight>
      </div>

      {deviceCount === 0 && (
        <div className="mt-6 rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/[0.06] to-transparent p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                Langkah pertama
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                Hubungkan device pertamamu
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Tiga langkah sampai pesan pertamamu terkirim.
              </p>
            </div>
            <Link
              href="/dashboard/devices"
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98]"
            >
              Tambah Device
              <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent-bright">
                  <s.icon size={17} />
                </span>
                <div>
                  <p className="bk-tabular font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                    Langkah 0{i + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-fg">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
