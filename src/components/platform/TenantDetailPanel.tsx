"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, Warning } from "@phosphor-icons/react";

interface TenantDetail {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  delayEnabled: boolean;
  delayAddonActive: boolean;
  devices: number;
  users: number;
  messages: number;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  priceDisplay: string;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
  isActive: boolean;
}

interface TenantDetailPanelProps {
  tenantId: string;
  initial: {
    tenant: TenantDetail;
    plans: PlanRow[];
    users: UserRow[];
    userTotal: number;
  };
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function TenantDetailPanel({ tenantId, initial }: TenantDetailPanelProps) {
  const router = useRouter();
  const [tenant, setTenant] = useState(initial.tenant);
  const [users, setUsers] = useState(initial.users);
  const [statusLoading, setStatusLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [delayLoading, setDelayLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Form tambah user
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uRole, setURole] = useState<"member" | "owner">("member");
  const [uLoading, setULoading] = useState(false);
  const [uError, setUError] = useState("");
  const [uSuccess, setUSuccess] = useState("");

  // Reset password
  const [pwUserId, setPwUserId] = useState<string | null>(null);
  const [pwError, setPwError] = useState("");

  async function toggleStatus() {
    const suspended = Boolean(tenant.suspendedAt);
    if (!suspended) {
      const okConfirm = window.confirm(
        "Yakin suspend tenant ini? Login dan API key langsung diblokir.",
      );
      if (!okConfirm) return;
    }
    setStatusLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: suspended ? "activate" : "suspend" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah status");
      setTenant((t) => ({
        ...t,
        suspendedAt: suspended ? null : new Date().toISOString(),
      }));
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setStatusLoading(false);
    }
  }

  async function assignPlan(planId: string) {
    setPlanLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: planId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal assign plan");
      setTenant((t) => {
        const plan = planId ? initial.plans.find((p) => p.id === planId) : null;
        return { ...t, planId: planId || null, planName: plan?.name ?? null };
      });
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setPlanLoading(false);
    }
  }

  async function setDelayEnabled(enabled: boolean) {
    setDelayLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah config delay");
      setTenant((t) => ({ ...t, delayEnabled: enabled }));
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setDelayLoading(false);
    }
  }

  async function toggleAddon(active: boolean) {
    setDelayLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/addons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "random_delay", active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah addon");
      setTenant((t) => ({ ...t, delayAddonActive: active }));
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setDelayLoading(false);
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setUError("");
    setUSuccess("");
    setULoading(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: uName.trim(), email: uEmail.trim(), password: uPassword, role: uRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat user");
      setUSuccess(`Akun ${uEmail.trim()} berhasil dibuat`);
      // Tambah ke daftar lokal agar langsung tampil tanpa reload penuh.
      setUsers((prev) => [
        ...prev,
        { id: data.id as string, email: uEmail.trim(), name: uName.trim(), role: uRole },
      ]);
      setUName("");
      setUEmail("");
      setUPassword("");
      setURole("member");
      router.refresh();
    } catch (e) {
      setUError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setULoading(false);
    }
  }

  async function resetPassword(userId: string) {
    const password = window.prompt("Password baru (min. 8 karakter)");
    if (!password) return;
    if (password.length < 8) {
      setPwError("Password minimal 8 karakter");
      return;
    }
    setPwUserId(userId);
    setPwError("");
    try {
      const res = await fetch(`/api/platform/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal reset password");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setPwUserId(null);
    }
  }

  const suspended = Boolean(tenant.suspendedAt);
  const quota = tenant.planId
    ? initial.plans.find((p) => p.id === tenant.planId)
    : null;
  const delayIncludedByPlan = Boolean(quota?.includesDelay);
  const delayEntitled = delayIncludedByPlan || tenant.delayAddonActive;

  return (
    <div className="mt-6 space-y-6">
      {/* Header + status */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Tenant
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            {tenant.name}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">Dibuat {formatDate(tenant.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {suspended ? (
            <span className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs text-red-400">
              Suspended
            </span>
          ) : (
            <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs text-accent-bright">
              Aktif
            </span>
          )}
          <button
            type="button"
            onClick={toggleStatus}
            disabled={statusLoading}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${
              suspended
                ? "border border-accent/40 bg-accent/10 text-accent-bright hover:bg-accent/20"
                : "bg-red-500/90 text-white hover:bg-red-500"
            }`}
          >
            {statusLoading ? "Memproses…" : suspended ? "Aktifkan" : "Suspend"}
          </button>
        </div>
      </div>

      {actionError && (
        <p className="bk-shake flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {actionError}
        </p>
      )}

      {/* Statistik */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Device", value: tenant.devices },
          { label: "User", value: tenant.users },
          { label: "Pesan", value: tenant.messages },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-medium text-fg-muted">{s.label}</p>
            <p className="bk-tabular mt-1 font-display text-3xl font-semibold tracking-tight">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Plan */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Plan</p>
            <p className="mt-1 text-sm text-fg">
              {tenant.planName ?? "Tanpa plan (tanpa kuota)"}
              {quota && (
                <span className="ml-2 font-mono text-xs text-fg-faint">
                  {quota.maxDevices} device · {quota.maxUsers} user ·{" "}
                  {quota.maxMessagesPerMonth === null ? "pesan unlimited" : `${quota.maxMessagesPerMonth} pesan/bulan`}
                </span>
              )}
            </p>
          </div>
          <select
            value={tenant.planId ?? ""}
            disabled={planLoading}
            onChange={(e) => assignPlan(e.target.value)}
            className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg transition-colors focus:border-accent focus:outline-none disabled:opacity-50"
          >
            <option value="">Tanpa plan</option>
            {initial.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.priceDisplay}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Random Delay (Anti-Spam) */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
              Random Delay (Anti-Spam)
            </p>
            <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
              Delay acak 3–10 detik sebelum kirim pesan keluar — mencegah deteksi
              spam. Waktu trigger &amp; kirim tercatat di riwayat pesan untuk analitik.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              delayEntitled
                ? "border-accent/25 bg-accent/10 text-accent-bright"
                : "border-line-soft bg-surface-2 text-fg-faint"
            }`}
          >
            {delayIncludedByPlan
              ? `Termasuk plan ${quota?.name ?? ""}`
              : tenant.delayAddonActive
                ? "Addon aktif"
                : "Belum tersedia"}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={tenant.delayEnabled}
            aria-label="Aktifkan random delay"
            disabled={!delayEntitled || delayLoading}
            onClick={() => setDelayEnabled(!tenant.delayEnabled)}
            className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              tenant.delayEnabled ? "bg-accent" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                tenant.delayEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-fg-muted">
            {tenant.delayEnabled ? "Delay aktif (3–10 dtk acak)" : "Delay nonaktif"}
          </span>
          {!delayEntitled && (
            <span className="text-xs text-fg-faint">
              Tenant belum berhak — berikan addon di bawah.
            </span>
          )}
          <button
            type="button"
            disabled={delayLoading}
            onClick={() => toggleAddon(!tenant.delayAddonActive)}
            className={`ml-auto rounded-full border px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${
              tenant.delayAddonActive
                ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-accent/40 bg-accent/10 text-accent-bright hover:bg-accent/20"
            }`}
          >
            {delayLoading
              ? "Memproses…"
              : tenant.delayAddonActive
                ? "Cabut addon"
                : "Berikan addon (random delay)"}
          </button>
        </div>
      </div>

      {/* Users */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Pengguna</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-line-soft">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
                <th className="px-4 py-2.5">Nama</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line-soft/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-fg">{u.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{u.email}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{u.role}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={pwUserId === u.id}
                      onClick={() => resetPassword(u.id)}
                      className="rounded-full border border-line px-3 py-1 text-xs text-fg-muted transition-colors hover:border-accent/50 hover:text-fg disabled:opacity-50"
                    >
                      {pwUserId === u.id ? "Menyimpan…" : "Reset Password"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-fg-faint">Belum ada pengguna.</p>
          )}
        </div>
        {pwError && <p className="mt-2 text-sm text-red-400">{pwError}</p>}
        {initial.userTotal > 100 && (
          <p className="mt-2 text-xs text-fg-faint">Menampilkan 100 user pertama.</p>
        )}

        {/* Form tambah user */}
        <form onSubmit={addUser} className="mt-6 grid gap-3 border-t border-line-soft pt-6 md:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <label htmlFor="u-name" className="mb-1 block text-xs font-medium text-fg-muted">
              Nama
            </label>
            <input
              id="u-name"
              value={uName}
              onChange={(e) => setUName(e.target.value)}
              className={fieldClass}
              placeholder="mis. Kasir Toko"
              required
            />
          </div>
          <div>
            <label htmlFor="u-email" className="mb-1 block text-xs font-medium text-fg-muted">
              Email
            </label>
            <input
              id="u-email"
              type="email"
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
              className={fieldClass}
              placeholder="nama@email.com"
              required
            />
          </div>
          <div>
            <label htmlFor="u-password" className="mb-1 block text-xs font-medium text-fg-muted">
              Password
            </label>
            <input
              id="u-password"
              type="password"
              value={uPassword}
              onChange={(e) => setUPassword(e.target.value)}
              className={fieldClass}
              placeholder="Min. 8 karakter"
              minLength={8}
              required
            />
          </div>
          <div className="flex items-end gap-2">
            <select
              value={uRole}
              onChange={(e) => setURole(e.target.value as "member" | "owner")}
              className="min-h-11 rounded-xl border border-line bg-ink-2 px-3 text-sm text-fg focus:border-accent focus:outline-none"
              aria-label="Role"
            >
              <option value="member">member</option>
              <option value="owner">owner</option>
            </select>
            <button
              type="submit"
              disabled={uLoading}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50"
            >
              {uLoading ? "Membuat…" : (
                <>
                  Tambah
                  <ArrowRight size={14} weight="bold" />
                </>
              )}
            </button>
          </div>
        </form>
        {uError && (
          <p className="bk-shake mt-3 flex items-start gap-2 text-sm text-red-400">
            <Warning size={15} className="mt-0.5 shrink-0" weight="fill" />
            {uError}
          </p>
        )}
        {uSuccess && (
          <p className="mt-3 flex items-start gap-2 text-sm text-accent-bright">
            <CheckCircle size={15} className="mt-0.5 shrink-0" weight="fill" />
            {uSuccess}
          </p>
        )}
      </div>
    </div>
  );
}
