import { getBinding } from "@/lib/cf";

export const DEVICE_STATUS_TTL_MS = 4_000;

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface CachedValue {
  status: string;
  phone: string | null;
  ts: number;
}

function cacheKey(deviceId: string): string {
  return `device:${deviceId}:status`;
}

export async function getCachedDeviceStatus(
  deviceId: string,
): Promise<{ status: string; phone: string | null } | null> {
  const kv = await getBinding<KvLike>("WAVIO_CACHE");
  const raw = await kv.get(cacheKey(deviceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedValue;
    if (Date.now() - parsed.ts > DEVICE_STATUS_TTL_MS) return null;
    return { status: parsed.status, phone: parsed.phone };
  } catch {
    return null;
  }
}

export async function setCachedDeviceStatus(
  deviceId: string,
  status: string,
  phone: string | null,
): Promise<void> {
  const kv = await getBinding<KvLike>("WAVIO_CACHE");
  const value: CachedValue = { status, phone, ts: Date.now() };
  await kv.put(cacheKey(deviceId), JSON.stringify(value), {
    expirationTtl: Math.ceil(DEVICE_STATUS_TTL_MS / 1000),
  });
}

export async function deleteCachedDeviceStatus(deviceId: string): Promise<void> {
  const kv = await getBinding<KvLike>("WAVIO_CACHE");
  await kv.delete(cacheKey(deviceId));
}
