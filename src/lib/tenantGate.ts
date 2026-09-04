// ─── Gate status tenant (operasi WhatsApp) ──────────────────────────────────
// Tenant "pending" = activatedAt NULL (baru daftar, belum bayar order pertama)
// → semua operasi operasional (kirim, device, API key) ditolak; owner tetap
// boleh login untuk menyelesaikan checkout. Tenant suspended tetap ditolak
// (aturan lama). Kode error eksplisit agar route bisa balas pesan yang jelas.

import { queryOne } from "@/lib/db";

export interface TenantActivation {
  activatedAt: string | null;
  suspendedAt: string | null;
  planId: string | null;
  pending: boolean;
}

export function isPendingTenantActivation(a: {
  activatedAt: string | null;
}): boolean {
  return a.activatedAt === null;
}

export async function getTenantActivation(tenantId: string): Promise<TenantActivation> {
  const row = await queryOne<{ activatedAt: string | null; suspendedAt: string | null; planId: string | null }>(
    'SELECT "activatedAt", "suspendedAt", "planId" FROM "Tenant" WHERE id = $1',
    [tenantId],
  );
  return {
    activatedAt: row?.activatedAt ?? null,
    suspendedAt: row?.suspendedAt ?? null,
    planId: row?.planId ?? null,
    pending: row ? row.activatedAt === null : true,
  };
}

/** Guard operasional: tenant harus aktif & tidak suspended. */
export async function assertTenantCanOperate(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const activation = await getTenantActivation(tenantId);
  if (activation.pending) {
    return {
      ok: false,
      error: "Tenant belum aktif — selesaikan pembayaran paket terlebih dahulu.",
      code: "TENANT_PENDING",
    };
  }
  if (activation.suspendedAt) {
    return {
      ok: false,
      error: "Tenant dinonaktifkan (suspended). Hubungi admin platform.",
      code: "TENANT_SUSPENDED",
    };
  }
  return { ok: true };
}