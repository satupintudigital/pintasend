import { listPlans } from "@/lib/platform";
import { PlansTable } from "@/components/platform/PlansTable";
export const dynamic = 'force-dynamic';

export default async function PlatformPlans() {
  const plans = await listPlans();
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Platform</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Plan & Kuota
      </h1>
      <p className="mt-2 max-w-[52ch] text-sm text-fg-muted">
        Kuota per tenant dijalankan dengan hard block — aksi yang melewati batas ditolak.
      </p>
      <div className="mt-8">
        <PlansTable initial={plans} />
      </div>
    </div>
  );
}
