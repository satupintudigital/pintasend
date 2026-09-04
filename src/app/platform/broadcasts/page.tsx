import { BroadcastTable } from "@/components/platform/BroadcastTable";

export default function PlatformBroadcasts() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Platform
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Broadcast
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Pengumuman platform ke nomor pemilik perangkat yang siap (bukan
            kontak tenant) — diproses worker terpisah.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <BroadcastTable />
      </div>
    </div>
  );
}
