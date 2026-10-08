// SSO wizard NalaNiaga → PintaSend. Verifikasi JWT HS256 (secret bersama
// NALANIAGA_SSO_SECRET), helper auth endpoint connect, dan pengiriman callback
// (HMAC + retry + SSRF guard). Dipakai route /api/connect/* & halaman /connect.

import { jwtVerify, SignJWT } from "jose";
import { hmacSha256Hex } from "./hmac";
import { isSafeWebhookUrl } from "./ssrf";
import { getRequestId, logEvent } from "./requestLogger";

export const INTEGRATION_KEY_LABEL = "Integrasi NalaNiaga";

export interface SsoClaims {
  storeId: string;
  storeName: string;
  callbackUrl: string;
  webhookUrl: string;
  jti: string;
}

function ssoSecretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.NALANIAGA_SSO_SECRET || process.env.PINTSEND_SSO_SECRET || "");
}

/** Hanya untuk test — issue token sama dengan sisi NalaNiaga. */
export async function issueConnectToken(claims: SsoClaims, ttlSec = 600): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.storeId)
    .setJti(claims.jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(ssoSecretKey());
}

export async function verifyConnectToken(token: string): Promise<SsoClaims | null> {
  try {
    const { payload } = await jwtVerify(token, ssoSecretKey(), { algorithms: ["HS256"] });
    const storeId = typeof payload.storeId === "string" ? payload.storeId : "";
    const callbackUrl = typeof payload.callbackUrl === "string" ? payload.callbackUrl : "";
    const webhookUrl = typeof payload.webhookUrl === "string" ? payload.webhookUrl : "";
    const jti = typeof payload.jti === "string" ? payload.jti : "";
    if (!storeId || !callbackUrl || !webhookUrl || !jti) return null;
    return {
      storeId,
      storeName: typeof payload.storeName === "string" ? payload.storeName : "",
      callbackUrl,
      webhookUrl,
      jti,
    };
  } catch {
    return null;
  }
}

/**
 * Auth endpoint connect: token dari body JSON `{ token }` (POST) atau header
 * `x-connect-token` (GET). Mengembalikan claims valid, atau Response 401.
 */
export async function authenticateConnect(
  req: Request,
): Promise<{ claims: SsoClaims } | Response> {
  let token = req.headers.get("x-connect-token") ?? "";
  if (!token) {
    try {
      const body = (await req.clone().json().catch(() => null)) as { token?: unknown } | null;
      token = typeof body?.token === "string" ? body.token : "";
    } catch {
      token = "";
    }
  }
  const claims = token ? await verifyConnectToken(token.trim()) : null;
  if (!claims) {
    const requestId = getRequestId(req);
    logEvent("warn", "connect_auth_failed", requestId);
    return Response.json(
      { error: "Token tidak valid atau kedaluwarsa. Mulai ulang dari NalaNiaga." },
      { status: 401 },
    );
  }
  return { claims };
}

export interface ConnectCallbackPayload {
  token: string;
  tenantId: string;
  deviceId: string;
  deviceLabel: string;
  apiKey: string;
  webhookUrl: string;
  webhookSecret: string;
}

/**
 * Kirim callback ke NalaNiaga (complete wizard). HMAC body mentah dengan
 * NALANIAGA_SSO_SECRET, retry 3× (2s/5s), SSRF guard pada callbackUrl.
 */
export async function deliverConnectCallback(
  claims: SsoClaims,
  payload: ConnectCallbackPayload,
): Promise<{ ok: boolean; status: number }> {
  const requestId = getRequestId(new Request("http://connect/complete"));
  const raw = JSON.stringify(payload);
  const secret = process.env.NALANIAGA_SSO_SECRET || process.env.PINTSEND_SSO_SECRET || "";
  const signature = `sha256=${await hmacSha256Hex(secret, raw)}`;

  if (!isSafeWebhookUrl(claims.callbackUrl)) {
    logEvent("error", "connect_callback_unsafe", requestId, { reason: "ssrf guard" });
    return { ok: false, status: 400 };
  }

  let lastStatus = 0;
  for (const delayMs of [0, 2000, 5000]) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(claims.callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pintasend-signature": signature,
          "x-request-id": requestId,
        },
        body: raw,
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = res.status;
      if (res.ok) return { ok: true, status: res.status };
    } catch (e) {
      logEvent("error", "connect_callback_failed", requestId, { detail: String(e) });
    }
  }
  return { ok: false, status: lastStatus || 502 };
}
