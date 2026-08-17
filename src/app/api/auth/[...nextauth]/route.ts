import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

// Rate limit khusus aksi login (POST /api/auth/callback/credentials).
// Basis: IP + email — mencegah brute-force password pada akun yang sama.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const isLogin = url.pathname.endsWith("/callback/credentials");

  if (isLogin) {
    let emailKey = "unknown";
    try {
      const body = (await req.clone().json().catch(() => null)) as
        | { email?: string }
        | null;
      emailKey = body?.email?.toLowerCase()?.trim() || "unknown";
    } catch {
      /* body non-JSON → pakai default */
    }

    const key = `login:${clientIp(req)}:${emailKey}`;
    const r = await checkRateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!r.allowed) return rateLimitResponse(r.retryAfterSec);
  }

  return handlers.POST(req);
}

export const GET = handlers.GET;
export { POST };
