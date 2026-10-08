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
      <div className="mt-8">
        <MetricsView initial={metrics} />
      </div>
    </div>
  );
}
