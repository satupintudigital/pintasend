"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CaretDown,
  DownloadSimple,
  MagnifyingGlass,
} from "@phosphor-icons/react";

interface AuditRow {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: string;
  ip: string | null;
  createdAt: string;
}

const PAGE_SIZE = 25;
const ROLE_LABEL: Record<string, string> = {
  platform_admin: "Platform admin",
  owner: "Owner",
  tenant_admin: "Tenant admin",
  member: "Member",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const action = sp.get("action") ?? "";
  const tenantId = sp.get("tenantId") ?? "";
  const q = sp.get("q") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));

  const [data, setData] = useState<{ logs: AuditRow[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (tenantId) params.set("tenantId", tenantId);
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  const queryString = params.toString();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/platform/audit?${queryString}`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Gagal memuat");
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  function pushFilters(next: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ action, tenantId, q, from, to, ...next })) {
      if (v) p.set(k, v);
    }
    router.push(`/platform/audit?${p.toString()}`);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          pushFilters({
            q: String(fd.get("q") ?? "").trim(),
            action: String(fd.get("action") ?? "").trim(),
            tenantId: String(fd.get("tenantId") ?? "").trim(),
            from: String(fd.get("from") ?? "").trim(),
            to: String(fd.get("to") ?? "").trim(),
          });
        }}
        className="grid gap-2 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[1fr_200px_180px_160px_160px_auto]"
      >
        <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 py-2">
          <MagnifyingGlass size={15} className="text-fg-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari action / target / isi meta…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
        </div>
        <input
          name="action"
          defaultValue={action}
          placeholder="Action (cth: tenant.suspend)"
          className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <input
          name="tenantId"
          defaultValue={tenantId}
          placeholder="Tenant ID"
          className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <input
          name="from"
          defaultValue={from}
          type="date"
          aria-label="Dari tanggal"
          className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg focus:outline-none"
        />
        <input
          name="to"
          defaultValue={to}
          type="date"
          aria-label="Sampai tanggal"
          className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
        >
          Filter
        </button>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-faint">
          {data ? `${data.total.toLocaleString("id-ID")} entri` : "Memuat…"}
        </p>
        <a
          href={`/api/platform/audit/export?${queryString}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
        >
          <DownloadSimple size={14} />
          Export CSV
        </a>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-fg-faint">Memuat…</p>}

      {data && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Aktor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-faint">
                    Belum ada entri audit yang cocok.
                  </td>
                </tr>
              )}
              {data.logs.map((row) => {
                const isOpen = expanded === row.id;
                let metaPretty: string | null = null;
                try {
                  metaPretty = JSON.stringify(JSON.parse(row.meta), null, 2);
                } catch {
                  metaPretty = row.meta;
                }
                return (
                  <AuditRowGroup
                    key={row.id}
                    row={row}
                    isOpen={isOpen}
                    metaPretty={metaPretty}
                    onToggle={() => setExpanded(isOpen ? null : row.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
            .map((n, idx, arr) => {
              const prev = arr[idx - 1];
              return (
                <span key={n} className="flex items-center gap-1">
                  {prev !== undefined && n - prev > 1 && (
                    <span className="px-1 text-fg-faint">…</span>
                  )}
                  <button
                    onClick={() => pushFilters({ page: String(n) })}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-medium transition-colors ${
                      n === page
                        ? "bg-accent text-accent-ink"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    {n}
                  </button>
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
}

function AuditRowGroup({
  row,
  isOpen,
  metaPretty,
  onToggle,
}: {
  row: AuditRow;
  isOpen: boolean;
  metaPretty: string | null;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-line-soft last:border-0 hover:bg-surface-2/40">
        <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-muted">
          {fmtTime(row.createdAt)}
        </td>
        <td className="px-4 py-3">
          <p className="text-fg">{row.actorEmail}</p>
          <p className="text-xs text-fg-faint">
            {ROLE_LABEL[row.actorRole] ?? row.actorRole}
            {row.ip ? ` · ${row.ip}` : ""}
          </p>
        </td>
        <td className="px-4 py-3">
          <span className="rounded-md bg-ink-2 px-2 py-0.5 font-mono text-xs text-accent-bright">
            {row.action}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-fg-muted">
          {row.targetType ? (
            <>
              <span className="text-fg-faint">{row.targetType}</span>{" "}
              <span className="font-mono">{row.targetId}</span>
            </>
          ) : (
            <span className="text-fg-faint">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {row.tenantId ? (
            <span className="font-mono text-xs text-fg-muted">{row.tenantId}</span>
          ) : (
            <span className="text-xs text-fg-faint">Platform</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={onToggle}
            aria-expanded={isOpen}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <CaretDown size={15} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-line-soft bg-ink-2/60 last:border-0">
          <td colSpan={6} className="px-4 py-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-ink px-3 py-2 font-mono text-xs text-fg-muted">
              {metaPretty}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
