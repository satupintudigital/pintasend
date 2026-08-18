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

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-6">
            <p className="text-sm font-medium text-fg-muted">{s.label}</p>
            <p className="bk-tabular mt-1 font-display text-4xl font-semibold tracking-tight">
              {s.value}
            </p>
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
            className="bk-lift rounded-2xl border border-line bg-surface hover:border-accent/30"
          >
            <Link href={l.href} className="group flex h-full flex-col p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
                <l.icon size={20} />
              </span>
              <p className="mt-6 text-sm font-medium text-fg">{l.label}</p>
              <ArrowRight
                size={16}
                className="mt-4 text-fg-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent-bright"
              />
            </Link>
          </Spotlight>
        ))}
      </div>
    </div>
  );
}
