"use client";

interface MetricsViewProps {
  initial: {
    messagesPerDay: { day: string; count: number }[];
    deviceStatus: { status: string; count: number }[];
    topTenants: { id: string; name: string; messages: number }[];
  };
}

// Bar chart CSS murni (tanpa dependency chart) — pesan per hari, 30 hari.
export function MetricsView({ initial }: MetricsViewProps) {
  const maxDay = Math.max(1, ...initial.messagesPerDay.map((d) => d.count));
  const maxStatus = Math.max(1, ...initial.deviceStatus.map((s) => s.count));

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Pesan per hari (30 hari)
        </h2>
        {initial.messagesPerDay.length === 0 ? (
          <p className="mt-6 text-sm text-fg-faint">Belum ada pemakaian pesan.</p>
        ) : (
          <div className="mt-5 flex h-40 items-end gap-[3px]">
            {initial.messagesPerDay.map((d) => (
              <div key={d.day} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-accent/70 transition-colors group-hover:bg-accent-bright"
                  style={{ height: `${Math.max(2, Math.round((d.count / maxDay) * 100))}%` }}
                />
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink-2 px-1.5 py-0.5 font-mono text-[10px] text-fg opacity-0 transition-opacity group-hover:opacity-100">
                  {d.day}: {d.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">Status device</h2>
          <ul className="mt-4 space-y-3">
            {initial.deviceStatus.map((s) => (
              <li key={s.status}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">{s.status}</span>
                  <span className="bk-tabular text-fg">{s.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, (s.count / maxStatus) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
            {initial.deviceStatus.length === 0 && (
              <li className="text-sm text-fg-faint">Belum ada device.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Top 5 tenant (pesan)
          </h2>
          <ol className="mt-4 space-y-3">
            {initial.topTenants.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="bk-tabular w-5 font-mono text-fg-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{t.name}</span>
                <span className="bk-tabular text-fg-muted">{t.messages}</span>
              </li>
            ))}
            {initial.topTenants.length === 0 && (
              <li className="text-sm text-fg-faint">Belum ada pemakaian pesan.</li>
            )}
          </ol>
        </div>
      </section>
    </div>
  );
}
