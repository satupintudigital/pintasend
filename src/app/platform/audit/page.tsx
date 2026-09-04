import { AuditTable } from "@/components/platform/AuditTable";

export default function PlatformAudit() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Platform
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Audit Log
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Jejak aksi platform & tenant: provisioning, suspend, plan, addon,
            user, API key, webhook, dan device.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <AuditTable />
      </div>
    </div>
  );
}
