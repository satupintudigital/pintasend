// Random delay kirim pesan (anti-spam) — config per tenant.
//
// Fitur AKTIF bila tenant mengaktifkan delay (Tenant.delayEnabled, diatur
// platform admin) DAN berhak: plan menyertakan fitur gratis (Plan.includesDelay,
// seed: Mocha) ATAU addon "random_delay" aktif (TenantAddon).
//
// Baca config dari Neon (source of truth) — jalur kirim v1/messages sudah
// membaca Neon untuk kuota/device, jadi tidak ada jalur D1 baru.

import { queryOne } from "@/lib/db";

export const DELAY_MIN_MS = 3000;
export const DELAY_MAX_MS = 10000;

export interface DelayInfo {
  /** Tenant.delayEnabled — config per tenant (admin). */
  enabled: boolean;
  /** Plan.includesDelay ATAU addon random_delay aktif. */
  entitled: boolean;
  /** enabled && entitled — fitur benar-benar berlaku. */
  active: boolean;
}

interface DelayRow {
  delayEnabled: boolean;
  includesDelay: boolean | null;
  addonActive: boolean | null;
}

// Pure function — di-unit-test (delay.test.ts).
export function resolveDelayActive(
  enabled: boolean,
  planIncludesDelay: boolean,
  addonActive: boolean,
): DelayInfo {
  const entitled = planIncludesDelay || addonActive;
  return { enabled, entitled, active: enabled && entitled };
}

// Delay acak inklusif [3000, 10000] ms — 3–10 detik sesuai kesepakatan.
export function randomDelayMs(): number {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Satu query Neon: join Tenant → Plan + EXISTS addon random_delay.
export async function getTenantDelayInfo(tenantId: string): Promise<DelayInfo> {
  const row = await queryOne<DelayRow>(
    `SELECT t."delayEnabled",
            p."includesDelay",
            EXISTS(SELECT 1 FROM "TenantAddon" a
                   WHERE a."tenantId" = t.id AND a.key = 'random_delay' AND a.active) AS "addonActive"
     FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
     WHERE t.id = $1`,
    [tenantId],
  );
  if (!row) return { enabled: false, entitled: false, active: false };
  return resolveDelayActive(
    row.delayEnabled,
    row.includesDelay ?? false,
    row.addonActive ?? false,
  );
}
