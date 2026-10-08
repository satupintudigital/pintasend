"use client";

import { useState } from "react";
import {
  DeviceMobile,
  ArrowClockwise,
  Power,
  MagnifyingGlass,
  CheckCircle,
  Warning,
  XCircle,
  Buildings,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface PlatformDeviceRow {
  id: string;
  label: string;
  tenantId: string;
  tenantName: string;
  status: string;
  phoneNumber: string | null;
  openwaSessionId: string;
  messagesIn: number;
  messagesOut: number;
  messagesTotal: number;
  updatedAt: string;
  createdAt: string;
}

interface DeviceInspectorTableProps {
  initialDevices: PlatformDeviceRow[];
  total: number;
  currentPage: number;
  limit: number;
  currentQ?: string;
  currentStatus?: string;
}

export function DeviceInspectorTable({
  initialDevices,
  total,
  currentPage,
  limit,
  currentQ = "",
  currentStatus = "",
}: DeviceInspectorTableProps) {
  const router = useRouter();
  const [devices, setDevices] = useState<PlatformDeviceRow[]>(initialDevices);
  const [q, setQ] = useState(currentQ);
  const [status, setStatus] = useState(currentStatus);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    router.push(`/platform/devices?${params.toString()}`);
  }

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (newStatus) params.set("status", newStatus);
    router.push(`/platform/devices?${params.toString()}`);
  }

  async function runDeviceAction(id: string, action: "logout" | "restart") {
    if (!window.confirm(`Yakin ingin ${action === "logout" ? "Force Logout" : "Restart"} device ini?`)) {
      return;
    }
    setLoadingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/platform/devices/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Gagal ${action} device`);
      }
      // Refresh router
      router.refresh();
    } catch (e: any) {
      setActionError(e.message || "Terjadi kesalahan");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" size={16} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari label, nomor HP, atau tenant..."
              className="w-full rounded-lg border border-surface-2 bg-surface-1 py-2 pl-9 pr-4 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-fg hover:bg-surface-3 transition-colors"
          >
            Cari
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-lg border border-surface-2 bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="">Semua Status</option>
            <option value="ready">Ready</option>
            <option value="pairing">Pairing</option>
            <option value="disconnected">Disconnected</option>
            <option value="banned">Banned</option>
          </select>
        </div>
      </form>

      {actionError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-surface-2 bg-surface-1 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg">
            <thead className="border-b border-surface-2 bg-surface-2/50 text-xs uppercase tracking-wider text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Device & Tenant</th>
                <th className="px-4 py-3 font-medium">Nomor WhatsApp</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-center">Pesan Masuk (In)</th>
                <th className="px-4 py-3 font-medium text-center">Pesan Keluar (Out)</th>
                <th className="px-4 py-3 font-medium">Session ID</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    Tidak ada device ditemukan.
                  </td>
                </tr>
              ) : (
                devices.map((d) => {
                  const isReady = d.status === "ready";
                  const isPairing = d.status === "pairing";
                  return (
                    <tr key={d.id} className="hover:bg-surface-2/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-fg">{d.label}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-fg-muted">
                          <Buildings size={13} className="text-fg-faint" />
                          <span>{d.tenantName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-fg-muted">
                        {d.phoneNumber ? `+${d.phoneNumber}` : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isReady
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : isPairing
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-surface-3 text-fg-muted border border-surface-2"
                          }`}
                        >
                          {isReady ? <CheckCircle size={12} /> : isPairing ? <Warning size={12} /> : <XCircle size={12} />}
                          <span className="capitalize">{d.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-xs">
                        <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-400 border border-blue-500/20">
                          {Number(d.messagesIn || 0).toLocaleString("id-ID")}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-xs">
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-400 border border-emerald-500/20">
                          {Number(d.messagesOut || 0).toLocaleString("id-ID")}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-fg-faint">
                        {d.openwaSessionId}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => runDeviceAction(d.id, "restart")}
                            disabled={loadingId === d.id}
                            title="Restart Session"
                            className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-accent/10 hover:text-accent transition-colors disabled:opacity-50"
                          >
                            <ArrowClockwise size={13} className={loadingId === d.id ? "animate-spin" : ""} />
                            <span>Restart</span>
                          </button>
                          <button
                            onClick={() => runDeviceAction(d.id, "logout")}
                            disabled={loadingId === d.id}
                            title="Force Logout"
                            className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            <Power size={13} />
                            <span>Logout</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
