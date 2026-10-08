"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, Warning, UserSwitch, Coins, CalendarPlus } from "@phosphor-icons/react";

interface TenantDetail {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  delayEnabled: boolean;
  delayAddonActive: boolean;
  watermarkAddonActive: boolean;
  messageRetentionDays: number;
  devices: number;
  users: number;
  messages: number;
}

interface RetentionRequestRow {
  id: string;
  requestedBy: string;
  reason: string;
  retentionDays: number;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface RetentionInfo {
  tenantId: string;
  retentionDays: number;
  defaultRetentionDays: number;
  maxRetentionDays: number;
  requests: RetentionRequestRow[];
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
  const [watermarkLoading, setWatermarkLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Retensi pesan (perpanjangan atas permintaan tertulis tenant)
  const [retention, setRetention] = useState<RetentionInfo | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionError, setRetentionError] = useState("");
  const [retentionSuccess, setRetentionSuccess] = useState("");
  const [rRequestedBy, setRRequestedBy] = useState("");
  const [rReason, setRReason] = useState("");
  const [rDays, setRDays] = useState("60");
  const [rSubmitLoading, setRSubmitLoading] = useState(false);
  const [rProcessId, setRProcessId] = useState<string | null>(null);

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

  async function toggleAddon(
    key: "random_delay" | "remove_watermark",
    field: "delayAddonActive" | "watermarkAddonActive",
    active: boolean,
  ) {
    const setLoading = key === "random_delay" ? setDelayLoading : setWatermarkLoading;
    setLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/addons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah addon");
      setTenant((t) => ({ ...t, [field]: active }));
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
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

  async function loadRetention() {
    setRetentionLoading(true);
    setRetentionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/retention`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat data retensi");
      setRetention(data);
    } catch (e) {
      setRetentionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setRetentionLoading(false);
    }
  }

  async function createRetentionRequest(e: React.FormEvent) {
    e.preventDefault();
    setRetentionError("");
    setRetentionSuccess("");
    setRSubmitLoading(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedBy: rRequestedBy.trim(),
          reason: rReason.trim(),
          retentionDays: Number(rDays),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mencatat permintaan");
      setRetentionSuccess("Permintaan tercatat (status pending) — menunggu persetujuan.");
      setRRequestedBy("");
      setRReason("");
      setRDays("60");
      await loadRetention();
      router.refresh();
    } catch (e) {
      setRetentionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setRSubmitLoading(false);
    }
  }

  async function processRetentionRequest(requestId: string, action: "approve" | "reject") {
    if (action === "approve") {
      const okConfirm = window.confirm(
        "Setujui perpanjangan retensi? Nilai retensi tenant langsung diperbarui.",
      );
      if (!okConfirm) return;
    }
    setRProcessId(requestId);
    setRetentionError("");
    setRetentionSuccess("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/retention/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal memproses permintaan");
      setRetentionSuccess(
        action === "approve"
          ? "Permintaan disetujui — retensi tenant diperbarui."
          : "Permintaan ditolak — retensi tenant tidak berubah.",
      );
      await loadRetention();
      router.refresh();
    } catch (e) {
      setRetentionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setRProcessId(null);
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
            onClick={async () => {
              setActionError("");
              try {
                const res = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, { method: "POST" });
                const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
                if (!res.ok) throw new Error(data.error || "Gagal impersonasi tenant");
                router.push(data.redirectTo || "/dashboard");
                router.refresh();
              } catch (e: unknown) {
                setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-all hover:bg-amber-500/20 active:scale-[0.97]"
          >
            <UserSwitch size={16} weight="bold" />
            Impersonate
          </button>
          <button
            type="button"
            onClick={async () => {
              const amountStr = prompt("Masukkan nominal saldo (Rp) untuk ditambah:", "50000");
              if (!amountStr) return;
              const amount = parseInt(amountStr, 10);
              if (isNaN(amount) || amount <= 0) {
                alert("Nominal tidak valid");
                return;
              }
              const reason = prompt("Alasan penyesuaian saldo:", "Topup manual superadmin");
              if (!reason) return;
              try {
                const res = await fetch(`/api/platform/tenants/${tenantId}/adjust-credit`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ amount, reason }),
                });
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(data.error || "Gagal menambah saldo");
                alert("Saldo berhasil ditambah!");
                router.refresh();
              } catch (e: unknown) {
                alert(e instanceof Error ? e.message : "Terjadi kesalahan");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent-bright transition-all hover:bg-accent/20 active:scale-[0.97]"
          >
            <Coins size={16} weight="bold" />
            Tambah Saldo
          </button>
          <button
            type="button"
            onClick={async () => {
              const daysStr = prompt("Perpanjang aktif berapa hari:", "30");
              if (!daysStr) return;
              const days = parseInt(daysStr, 10);
              if (isNaN(days) || days <= 0) {
                alert("Jumlah hari tidak valid");
                return;
              }
              try {
                const res = await fetch(`/api/platform/tenants/${tenantId}/extend-period`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ days }),
                });
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(data.error || "Gagal memperpanjang masa aktif");
                alert("Masa aktif berhasil diperpanjang!");
                router.refresh();
              } catch (e: unknown) {
                alert(e instanceof Error ? e.message : "Terjadi kesalahan");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold text-fg-muted transition-all hover:border-accent/40 hover:text-fg active:scale-[0.97]"
          >
            <CalendarPlus size={16} weight="bold" />
            Perpanjang Aktif
          </button>
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
            onClick={() => toggleAddon("random_delay", "delayAddonActive", !tenant.delayAddonActive)}
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

      {/* Hapus Watermark (pesan keluar WhatsApp) */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
              Hapus Watermark
            </p>
            <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
              Footnote iklan platform otomatis ditambahkan di akhir setiap pesan
              keluar melalui PintaSend (teks maupun caption media) — media promosi
              kami. Dengan addon ini, footnote dihapus dari semua pesan tenant.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              tenant.watermarkAddonActive
                ? "border-accent/25 bg-accent/10 text-accent-bright"
                : "border-line-soft bg-surface-2 text-fg-faint"
            }`}
          >
            {tenant.watermarkAddonActive
              ? "Addon aktif — tanpa footnote"
              : "Watermark aktif di tiap pesan"}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={watermarkLoading}
            onClick={() => toggleAddon("remove_watermark", "watermarkAddonActive", !tenant.watermarkAddonActive)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${
              tenant.watermarkAddonActive
                ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-accent/40 bg-accent/10 text-accent-bright hover:bg-accent/20"
            }`}
          >
            {watermarkLoading
              ? "Memproses…"
              : tenant.watermarkAddonActive
                ? "Cabut addon"
                : "Berikan addon (hapus watermark)"}
          </button>
        </div>
      </div>

      {/* Retensi Pesan (perpanjangan atas permintaan tertulis tenant) */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
              Retensi Pesan
            </p>
            <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
              Pesan &amp; log pengiriman dihapus otomatis setelah jangka waktu ini
              (kebijakan default 30 hari). Tenant dapat meminta penyimpanan lebih
              lama secara tertulis — permintaan harus disetujui di sini.
            </p>
          </div>
          <button
            type="button"
            disabled={retentionLoading}
            onClick={loadRetention}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-fg-muted transition-all hover:border-accent/50 hover:text-fg active:scale-[0.97] disabled:opacity-50"
          >
            {retentionLoading ? "Memuat…" : "Muat data retensi"}
          </button>
        </div>

        {retentionError && <p className="mt-3 text-sm text-red-400">{retentionError}</p>}
        {retentionSuccess && (
          <p className="mt-3 flex items-start gap-2 text-sm text-accent-bright">
            <CheckCircle size={15} className="mt-0.5 shrink-0" weight="fill" />
            {retentionSuccess}
          </p>
        )}

        {retention && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-line-soft bg-surface-2 p-4">
                <p className="text-xs font-medium text-fg-muted">Retensi efektif</p>
                <p className="bk-tabular mt-1 font-display text-2xl font-semibold">
                  {retention.retentionDays} hari
                </p>
              </div>
              <div className="rounded-xl border border-line-soft bg-surface-2 p-4">
                <p className="text-xs font-medium text-fg-muted">Default kebijakan</p>
                <p className="bk-tabular mt-1 font-display text-2xl font-semibold">
                  {retention.defaultRetentionDays} hari
                </p>
              </div>
              <div className="rounded-xl border border-line-soft bg-surface-2 p-4">
                <p className="text-xs font-medium text-fg-muted">Maks. perpanjangan</p>
                <p className="bk-tabular mt-1 font-display text-2xl font-semibold">
                  {retention.maxRetentionDays} hari
                </p>
              </div>
            </div>

            {/* Form permintaan perpanjangan (instruksi tertulis) */}
            <form
              onSubmit={createRetentionRequest}
              className="mt-5 grid gap-3 rounded-xl border border-line-soft bg-surface-2 p-4 md:grid-cols-[1fr_120px_auto]"
            >
              <div>
                <label htmlFor="r-requested-by" className="mb-1 block text-xs font-medium text-fg-muted">
                  Pemohon (nama/email tenant)
                </label>
                <input
                  id="r-requested-by"
                  value={rRequestedBy}
                  onChange={(e) => setRRequestedBy(e.target.value)}
                  className={fieldClass}
                  placeholder="mis. owner@toko.example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="r-days" className="mb-1 block text-xs font-medium text-fg-muted">
                  Hari
                </label>
                <input
                  id="r-days"
                  type="number"
                  min={retention.defaultRetentionDays}
                  max={retention.maxRetentionDays}
                  value={rDays}
                  onChange={(e) => setRDays(e.target.value)}
                  className={fieldClass}
                  required
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={rSubmitLoading}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50"
                >
                  {rSubmitLoading ? "Menyimpan…" : (
                    <>
                      Catat permintaan
                      <ArrowRight size={14} weight="bold" />
                    </>
                  )}
                </button>
              </div>
              <div className="md:col-span-3">
                <label htmlFor="r-reason" className="mb-1 block text-xs font-medium text-fg-muted">
                  Instruksi tertulis / alasan (referensi surat, email, atau kontrak)
                </label>
                <textarea
                  id="r-reason"
                  value={rReason}
                  onChange={(e) => setRReason(e.target.value)}
                  className={fieldClass}
                  rows={2}
                  placeholder="mis. Arsip layanan pelanggan 6 bulan sesuai kontrak No. …"
                  required
                />
              </div>
            </form>

            {/* Daftar permintaan */}
            <div className="mt-5 overflow-hidden rounded-xl border border-line-soft">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
                    <th className="px-4 py-2.5">Pemohon</th>
                    <th className="px-4 py-2.5">Alasan</th>
                    <th className="px-4 py-2.5">Hari</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {retention.requests.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-fg">{r.requestedBy}</p>
                        <p className="font-mono text-xs text-fg-faint">{r.createdAt.slice(0, 10)}</p>
                      </td>
                      <td className="max-w-[26ch] px-4 py-2.5 text-fg-muted">{r.reason}</td>
                      <td className="bk-tabular px-4 py-2.5 text-fg">{r.retentionDays}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            r.status === "approved"
                              ? "border-accent/25 bg-accent/10 text-accent-bright"
                              : r.status === "rejected"
                                ? "border-red-500/25 bg-red-500/10 text-red-400"
                                : "border-line bg-surface-2 text-fg-muted"
                          }`}
                        >
                          {r.status}
                          {r.approvedBy ? ` · ${r.approvedBy}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={rProcessId === r.id}
                              onClick={() => processRetentionRequest(r.id, "approve")}
                              className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-bright transition-colors hover:bg-accent/20 disabled:opacity-50"
                            >
                              {rProcessId === r.id ? "Memproses…" : "Setujui"}
                            </button>
                            <button
                              type="button"
                              disabled={rProcessId === r.id}
                              onClick={() => processRetentionRequest(r.id, "reject")}
                              className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                            >
                              {rProcessId === r.id ? "Memproses…" : "Tolak"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {retention.requests.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-fg-faint">
                        Belum ada permintaan perpanjangan retensi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
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
