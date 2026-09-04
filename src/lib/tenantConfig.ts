// Tenant config cache — KV-backed, menghilangkan Neon queries di hot path.
//
// Sebelum: setiap POST /v1/messages memicu 5 Neon round-trips:
//   1. Device lookup (queryOne Device)
//   2. getTenantQuota (Tenant→Plan JOIN)
//   3. countMessagesThisMonth (MessageLog COUNT)
//   4. getTenantDelayInfo (Tenant→Plan + TenantAddon EXISTS)
//   5. tenantHasRemoveWatermark (TenantAddon SELECT)
//
// Sesudah: 0 Neon queries — semua dibaca dari KV cache (TTL 60s) atau D1.
// KV diisi dari Neon sekali saat cache miss, lalu dipakai berulang tanpa
// koneksi database. Cache di-invalidate saat config diubah (admin panel).

import { getBinding } from "@/lib/cf";
import { query } from "@/lib/db";
import {
  CAMPAIGN_ADDON_KEY,
  RANDOM_DELAY_ADDON_KEY,
  REMOVE_WATERMARK_ADDON_KEY,
} from "@/lib/addonKeys";

// ── KV types ────────────────────────────────────────────────────────────────

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// TTL KV (detik) — minimum 60 dtk. TTL logis dijaga via field `ts` embedded.
const KV_TTL_S = 60;

// ── Config shape ────────────────────────────────────────────────────────────

export interface TenantPlanConfig {
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
}

export interface TenantAddonConfig {
  removeWatermark: boolean;
  randomDelay: boolean;
  /** Modul WA Campaign (blast massal) — fitur berbayar per tenant. */
  campaign: boolean;
}

export interface TenantFeatureConfig {
  delayEnabled: boolean;
}

export interface CachedTenantConfig {
  plan: TenantPlanConfig;
  addons: TenantAddonConfig;
  features: TenantFeatureConfig;
  /** Message count bulan berjalan (WIB) — di-cache 60s. */
  messageCount: number;
  ts: number;
}

// Default: tanpa plan, tanpa addon, tanpa delay, count 0.
const EMPTY_CONFIG: Omit<CachedTenantConfig, "ts"> = {
  plan: { maxDevices: 0, maxUsers: 0, maxMessagesPerMonth: null, includesDelay: false },
  addons: { removeWatermark: false, randomDelay: false, campaign: false },
  features: { delayEnabled: false },
  messageCount: 0,
};

// ── KV helpers ──────────────────────────────────────────────────────────────

function cacheKey(tenantId: string): string {
  return `tenant:${tenantId}:config`;
}

async function readCache(tenantId: string): Promise<CachedTenantConfig | null> {
  try {
    const kv = await getBinding<KvLike>("WAVIO_CACHE");
    const raw = await kv.get(cacheKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTenantConfig;
    if (Date.now() - parsed.ts > KV_TTL_S * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(tenantId: string, config: CachedTenantConfig): Promise<void> {
  try {
    const kv = await getBinding<KvLike>("WAVIO_CACHE");
    await kv.put(cacheKey(tenantId), JSON.stringify(config), {
      expirationTtl: KV_TTL_S,
    });
  } catch {
    // KV tidak tersedia (dev/test) — ignore.
  }
}

// ── Neon fetch (sekali saat cache miss) ─────────────────────────────────────

async function fetchFromNeon(tenantId: string): Promise<CachedTenantConfig> {
  // Satu query gabungan: Tenant→Plan + addons + delay + message count.
  // Menggantikan 4 Neon queries terpisah (quota 2x, delay 1x, watermark 1x).
  const now = new Date();
  const monthStart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => monthStart.find((p) => p.type === t)?.value ?? "";
  const monthStartIso = `${get("year")}-${get("month")}-01T00:00:00+07:00`;

  const rows = await query<{
    maxDevices: number | null;
    maxUsers: number | null;
    maxMessagesPerMonth: number | null;
    includesDelay: boolean | null;
    delayEnabled: boolean | null;
    removeWm: boolean | null;
    randomDelay: boolean | null;
    campaignAddon: boolean | null;
    msgCount: number | null;
  }>(
    `SELECT
       p."maxDevices", p."maxUsers", p."maxMessagesPerMonth", p."includesDelay",
       t."delayEnabled",
       EXISTS(SELECT 1 FROM "TenantAddon" a WHERE a."tenantId" = t.id AND a.key = '${REMOVE_WATERMARK_ADDON_KEY}' AND a.active) AS "removeWm",
       EXISTS(SELECT 1 FROM "TenantAddon" a WHERE a."tenantId" = t.id AND a.key = '${RANDOM_DELAY_ADDON_KEY}' AND a.active) AS "randomDelay",
       EXISTS(SELECT 1 FROM "TenantAddon" a WHERE a."tenantId" = t.id AND a.key = '${CAMPAIGN_ADDON_KEY}' AND a.active) AS "campaignAddon",
       (SELECT COUNT(*)::int FROM "MessageLog" m WHERE m."tenantId" = t.id AND m."createdAt" >= $2) AS "msgCount"
     FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
     WHERE t.id = $1`,
    [tenantId, monthStartIso],
  );

  const row = rows[0];
  if (!row) return { ...EMPTY_CONFIG, ts: Date.now() };

  return {
    plan: {
      maxDevices: row.maxDevices ?? 0,
      maxUsers: row.maxUsers ?? 0,
      maxMessagesPerMonth: row.maxMessagesPerMonth ?? null,
      includesDelay: row.includesDelay ?? false,
    },
    addons: {
      removeWatermark: row.removeWm ?? false,
      randomDelay: row.randomDelay ?? false,
      campaign: row.campaignAddon ?? false,
    },
    features: {
      delayEnabled: row.delayEnabled ?? false,
    },
    messageCount: row.msgCount ?? 0,
    ts: Date.now(),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Dapatkan config tenant — KV cache first, fallback Neon. */
export async function getTenantConfig(tenantId: string): Promise<CachedTenantConfig> {
  const cached = await readCache(tenantId);
  if (cached) return cached;
  const config = await fetchFromNeon(tenantId);
  await writeCache(tenantId, config);
  return config;
}

/** Invalidate cache saat config diubah (admin panel). */
export async function invalidateTenantConfig(tenantId: string): Promise<void> {
  try {
    const kv = await getBinding<KvLike>("WAVIO_CACHE");
    await kv.delete(cacheKey(tenantId));
  } catch {
    // ignore
  }
}
