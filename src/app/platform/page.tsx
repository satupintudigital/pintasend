import Link from "next/link";
import { ArrowRight, ChartLineUp, Stack, UsersThree } from "@phosphor-icons/react/ssr";
import { getPlatformMetrics, listTenants } from "@/lib/platform";
import { Spotlight } from "@/components/Spotlight";

export default async function PlatformHome() {
  const [metrics, tenantPage] = await Promise.all([
    getPlatformMetrics(),
    listTenants({ limit: 100 }),
  ]);
  const tenants = tenantPage.tenants;
  const totalDevices = metrics.deviceStatus.reduce((s, d) => s + d.count, 0);
  const totalMessages = metrics.messagesPerDay.reduce((s, d) => s + d.count, 0);
  const active = tenants.filter((t) => !t.suspendedAt).length;
  const suspended = tenants.length - active;

  const stats = [
    { label: "Total tenant", value: tenants.length },
    { label: "Tenant aktif", value: active },
    { label: "Suspended", value: suspended },
    { label: "Total device", value: totalDevices },
    { label: "Total pesan (30 hari)", value: totalMessages },
  ];

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Platform</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Ringkasan Platform
      </h1>

      <div className="mt-10 grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="group relative overflow-hidden rounded-2xl border border-line/60 bg-surface p-5 shadow-sm shadow-ink/5 transition-all hover:border-accent/30 hover:shadow-lg hover:shadow-accent/10">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <p className="text-xs font-medium uppercase tracking-widest text-fg-faint">{s.label}</p>
              <p className="bk-tabular mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
                {s.value}
              </p>
              <div className="mt-2 h-1 w-8 rounded-full bg-accent" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { href: "/platform/metrics", label: "Metrik lintas tenant", icon: ChartLineUp },
          { href: "/platform/tenants", label: "Kelola tenant", icon: UsersThree },
          { href: "/platform/plans", label: "Plan & kuota", icon: Stack },
        ].map((l) => (
          <Spotlight
            key={l.href}
            className="bk-lift rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-ink/5 hover:border-accent/30 hover:shadow-xl hover:shadow-accent/10"
          >
            <Link href={l.href} className="group flex h-full flex-col">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent-bright transition-transform group-hover:scale-105">
                <l.icon size={22} weight="duotone" />
              </div>
              <div className="flex-1">
                <p className="mt-4 text-sm font-semibold text-fg">{l.label}</p>
                <p className="mt-1 text-xs text-fg-faint">Kelola dari dashboard</p>
              </div>
              <ArrowRight
                size={16}
                className="mt-auto -mb-2 text-fg-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent-bright"
              />
            </Link>
          </Spotlight>
        ))}
      </div>
    </div>
  );
}
