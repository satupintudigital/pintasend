"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserSwitch, ArrowUUpLeft } from "@phosphor-icons/react";

interface ImpersonationBannerProps {
  tenantName?: string;
}

export function ImpersonationBanner({ tenantName }: ImpersonationBannerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function exitImpersonation() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/exit-impersonate", { method: "POST" });
      if (!res.ok) throw new Error("Gagal keluar dari impersonasi");
      router.push("/platform");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200 shadow-sm">
      <div className="flex items-center gap-2.5">
        <UserSwitch size={20} className="shrink-0 text-amber-400" weight="duotone" />
        <div className="text-sm">
          <span className="font-semibold">Mode Impersonasi Aktif</span>
          {tenantName && <span className="ml-1 text-amber-300">({tenantName})</span>} — Anda sedang melihat dashboard sebagai tenant.
        </div>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={exitImpersonation}
        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-ink transition-all hover:bg-amber-400 active:scale-[0.97] disabled:opacity-50"
      >
        <ArrowUUpLeft size={14} weight="bold" />
        {loading ? "Keluar…" : "Kembali ke Platform Admin"}
      </button>
    </div>
  );
}
