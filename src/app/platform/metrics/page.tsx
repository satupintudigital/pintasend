import { getPlatformMetrics } from "@/lib/platform";
import { MetricsView } from "@/components/platform/MetricsView";
export const dynamic = 'force-dynamic';

export default async function PlatformMetrics() {
  const metrics = await getPlatformMetrics();
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Platform</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Metrik Lintas Tenant
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        Pemakaian agregat seluruh tenant PintaSend.
      </p>

      {/* Financial Metrics Cards */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "MRR", value: `Rp ${metrics.financial.mrr.toLocaleString("id-ID")}` },
          { label: "MTD Revenue", value: `Rp ${metrics.financial.totalRevenueMtd.toLocaleString("id-ID")}` },
          { label: "Paid Orders", value: metrics.financial.totalOrdersPaid },
          { label: "Prepaid Volume", value: metrics.financial.prepaidVolume.toLocaleString("id-ID") + " msg" },
        ].map((f) => (
          <div key={f.label} className="group relative overflow-hidden rounded-2xl border border-accent/40 bg-accent/5 p-5 shadow-sm shadow-ink/5 transition-all hover:border-accent/60 hover:shadow-lg hover:shadow-accent/10">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <p className="text-xs font-medium uppercase tracking-widest text-accent-bright">{f.label}</p>
              <p className="bk-tabular mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-fg">
                {f.value}
              </p>
              <div className="mt-2 h-1 w-8 rounded-full bg-accent" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <MetricsView initial={metrics} />
      </div>
    </div>
  );
}
