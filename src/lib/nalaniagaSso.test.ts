import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { verifyConnectToken, authenticateConnect, INTEGRATION_KEY_LABEL } from "./nalaniagaSso";

const claims = {
  storeId: "store-1",
  storeName: "Toko A",
  callbackUrl: "https://x.nalaniaga.id/api/webhooks/pintasend/callback",
  webhookUrl: "https://x.nalaniaga.id/api/webhooks/whatsapp",
  jti: "jti-1",
};

beforeEach(() => {
  vi.stubEnv("NALANIAGA_SSO_SECRET", "test-secret-0123456789abcdef0123456789abcdef");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifyConnectToken", () => {
  it("menerima JWT HS256 valid berisi klaim lengkap", async () => {
    const { issueConnectToken } = await import("./nalaniagaSso");
    const token = await issueConnectToken(claims);
    expect(await verifyConnectToken(token)).toEqual(claims);
  });

  it("menolak token sampah / secret salah", async () => {
    expect(await verifyConnectToken("garbage")).toBeNull();
  });
});

describe("authenticateConnect", () => {
  it("membaca token dari body JSON", async () => {
    const { issueConnectToken } = await import("./nalaniagaSso");
    const token = await issueConnectToken(claims);
    const req = new Request("http://x/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const out = await authenticateConnect(req);
    expect(out).toMatchObject({ claims });
  });

  it("membaca token dari header x-connect-token (GET)", async () => {
    const { issueConnectToken } = await import("./nalaniagaSso");
    const token = await issueConnectToken(claims);
    const req = new Request("http://x/qr", { headers: { "x-connect-token": token } });
    const out = await authenticateConnect(req);
    expect(out).toMatchObject({ claims });
  });

  it("token tidak ada / invalid → Response 401", async () => {
    const out = await authenticateConnect(new Request("http://x/"));
    expect(out).toBeInstanceOf(Response);
    if (out instanceof Response) expect(out.status).toBe(401);
  });

  it("INTEGRATION_KEY_LABEL dipakai identifikasi key integrasi", () => {
    expect(INTEGRATION_KEY_LABEL).toBe("Integrasi NalaNiaga");
  });
});
