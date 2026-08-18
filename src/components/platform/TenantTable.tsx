"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";

interface TenantRow {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planName: string | null;
  delayEnabled: boolean;
  devices: number;
  users: number;
  messages: number;
}

const PAGE_SIZE = 20;

export function TenantTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const [data, setData] = useState<{ tenants: TenantRow[]; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/platform/tenants?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Gagal memuat");
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = new FormData(e.currentTarget).get("q") as string;
          router.push(`/platform/tenants?q=${encodeURIComponent(input.trim())}`);
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 py-2">
          <MagnifyingGlass size={16} className="text-fg-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari nama tenant…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
        </div>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data && !error && <p className="text-sm text-fg-faint">Memuat…</p>}

      {data && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Device</th>
                <th className="px-4 py-3 text-right">User</th>
                <th className="px-4 py-3 text-right">Pesan</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-line-soft/60 last:border-0 hover:bg-surface-2/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="font-medium text-fg hover:text-accent-bright"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{t.planName ?? "—"}</td>
                  <td className="bk-tabular px-4 py-3 text-right text-fg-muted">{t.devices}</td>
                  <td className="bk-tabular px-4 py-3 text-right text-fg-muted">{t.users}</td>
                  <td className="bk-tabular px-4 py-3 text-right text-fg-muted">{t.messages}</td>
                  <td className="px-4 py-3">
                    {t.suspendedAt ? (
                      <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                        Suspended
                      </span>
                    ) : (
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs text-accent-bright">
                        Aktif
                      </span>
                    )}
                    {t.delayEnabled && (
                      <span
                        className="ml-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                        title="Random delay kirim aktif"
                      >
                        delay
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.tenants.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-fg-faint">Tidak ada tenant.</p>
          )}
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => router.push(`/platform/tenants?q=${encodeURIComponent(q)}&page=${page - 1}`)}
            className="rounded-full border border-line px-3 py-1.5 text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="font-mono text-xs text-fg-faint">
            Hal {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => router.push(`/platform/tenants?q=${encodeURIComponent(q)}&page=${page + 1}`)}
            className="rounded-full border border-line px-3 py-1.5 text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      )}
    </div>
  );
}
