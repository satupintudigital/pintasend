import { getBinding } from "@/lib/cf";

export const DEVICE_STATUS_TTL_MS = 4_000;
export const DEVICE_LIST_TTL_MS = 5_000;
// Cloudflare KV: expirationTtl minimum 60 dtk. TTL logis (4–5 dtk) dijaga via
// field `ts` embedded — TTL KV hanya jaring pengaman agar key tidak abadi.
export const KV_TTL_SAFETY_S = 60;

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// Device DTO lengkap — sama dengan shape yang dikembalikan GET /api/devices/:id
// saat cache miss, sehingga kontrak API konsisten untuk klien.
export interface DeviceCacheValue {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  phone: string | null;
  /** JSON string { kind, code, expiresAt } (session.restriction); null = tidak ada. */
  restriction: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredValue {
  device: DeviceCacheValue;
  ts: number;
}

function cacheKey(deviceId: string): string {
  return `device:${deviceId}:status`;
}

export async function getCachedDevice(deviceId: string): Promise<DeviceCacheValue | null> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  const raw = await kv.get(cacheKey(deviceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredValue;
    if (Date.now() - parsed.ts > DEVICE_STATUS_TTL_MS) return null;
    return parsed.device;
  } catch {
    return null;
  }
}

export async function setCachedDevice(device: DeviceCacheValue): Promise<void> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  const value: StoredValue = { device, ts: Date.now() };
  await kv.put(cacheKey(device.id), JSON.stringify(value), {
    expirationTtl: KV_TTL_SAFETY_S,
  });
}

export async function deleteCachedDevice(deviceId: string): Promise<void> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  await kv.delete(cacheKey(deviceId));
}

// ── Cooldown rekonsiliasi webhook OpenWA ─────────────────────────────────────
// Rekonsiliasi (ensureDeviceWebhookEvents) memanggil listWebhooks OpenWA; dipicu
// dari polling status device (cache-miss ~tiap beberapa detik). Tanpa cooldown,
// itu jadi spam ke OpenWA. Guard ini membatasi maksimal SATU upaya per device
// per WEBHOOK_RECONCILE_COOLDOWN_MS (default 5 menit). Timestamp ditulis SEBELUM
// upaya (bukan sesudah) agar OpenWA down tidak memicu retry tiap polling.
export const WEBHOOK_RECONCILE_COOLDOWN_MS = 5 * 60_000;

export async function shouldReconcileWebhook(deviceId: string): Promise<boolean> {
  try {
    const kv = await getBinding<KvLike>("PINTSEND_CACHE");
    const key = `device:${deviceId}:whreconcile`;
    const raw = await kv.get(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { ts: number };
        if (Date.now() - parsed.ts < WEBHOOK_RECONCILE_COOLDOWN_MS) return false;
      } catch {
        /* value korup → timpa di bawah */
      }
    }
    await kv.put(key, JSON.stringify({ ts: Date.now() }), {
      expirationTtl: Math.max(KV_TTL_SAFETY_S, Math.ceil(WEBHOOK_RECONCILE_COOLDOWN_MS / 1000)),
    });
  } catch {
    // Binding tidak tersedia (dev/test) → izinkan (pemanggil tetap best-effort).
  }
  return true;
}

function listCacheKey(tenantId: string): string {
  return `devices:${tenantId}:list`;
}

export async function getCachedDeviceList(tenantId: string): Promise<DeviceCacheValue[] | null> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  const raw = await kv.get(listCacheKey(tenantId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { devices: DeviceCacheValue[]; ts: number };
    if (Date.now() - parsed.ts > DEVICE_LIST_TTL_MS) return null;
    return parsed.devices;
  } catch {
    return null;
  }
}

export async function setCachedDeviceList(
  tenantId: string,
  devices: DeviceCacheValue[],
): Promise<void> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  await kv.put(listCacheKey(tenantId), JSON.stringify({ devices, ts: Date.now() }), {
    expirationTtl: KV_TTL_SAFETY_S,
  });
}

export async function deleteCachedDeviceList(tenantId: string): Promise<void> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  await kv.delete(listCacheKey(tenantId));
}
