// Rate limiter in-app (defense-in-depth, lapisan pertama).
//
// Backend: Cloudflare KV (binding WAVIO_RATE_LIMIT) — state global lintas
// isolate/colo (eventual consistency, cukup untuk anti brute-force dasar).
// Fallback: in-memory Map (per-isolate) saat tidak ada konteks Workers
// (dev lokal, unit test).
//
// Fixed-window per bucket: key = `rl:{key}:{windowBucket}` dengan TTL
// otomatis = windowMs. Counter KV best-effort (read-modify-write non-atomik,
// eventual consistent) — bukan pengganti WAF rate limiting/akuntansi ketat.
//
// Design key:
// - login → `login:{ip}:{email}` (cegah brute-force password akun)
// - mutasi device → `device-create:{tenantId}:{ip}` / `device-mutate:...`

const DEFAULT_WINDOW_MS = 60_000;
const MAX_MEM_BUCKETS = 10_000;

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Berapa detik lagi key boleh mencoba lagi (hanya saat allowed=false). */
  retryAfterSec?: number;
}

// Fallback in-memory (dev/test): bucket → { count, resetAt }.
const mem = new Map<string, { count: number; resetAt: number }>();

async function getKv(): Promise<KvLike | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const kv = (env as Record<string, unknown>).WAVIO_RATE_LIMIT as KvLike | undefined;
    return kv;
  } catch {
    return undefined; // bukan runtime Workers → in-memory
  }
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs) * windowMs;
  const fullKey = `rl:${key}:${bucket}`;

  const kv = await getKv();
  if (kv) {
    const current = Number((await kv.get(fullKey)) ?? "0");
    if (current >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket + windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    await kv.put(fullKey, String(current + 1), {
      expirationTtl: Math.ceil(windowMs / 1000),
    });
    return { allowed: true };
  }

  // In-memory fallback.
  const entry = mem.get(fullKey);
  if (!entry || entry.resetAt <= now) {
    if (mem.size > MAX_MEM_BUCKETS) pruneMem();
    mem.set(fullKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  entry.count += 1;
  return { allowed: true };
}

function pruneMem() {
  const now = Date.now();
  for (const [key, entry] of mem) {
    if (entry.resetAt <= now) mem.delete(key);
  }
}

/** IP klien: preferensi CF-Connecting-IP (Workers), fallback X-Forwarded-For. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Helper untuk membuat respons 429 dengan header Retry-After. */
export function rateLimitResponse(retryAfterSec?: number): Response {
  return Response.json(
    {
      error: retryAfterSec
        ? `Terlalu banyak percobaan. Coba lagi dalam ${retryAfterSec} detik.`
        : "Terlalu banyak permintaan. Coba lagi nanti.",
    },
    {
      status: 429,
      headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
    },
  );
}

/** Reset internal (khusus test). */
export function _resetRateLimits() {
  mem.clear();
}
