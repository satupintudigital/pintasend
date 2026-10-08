import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const authMock = vi.fn();
const tenantMock = vi.fn();
const rateMock = vi.fn();
const deviceMock = vi.fn();

vi.mock("@/lib/nalaniagaSso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nalaniagaSso")>();
  return { ...actual, authenticateConnect: (...a: unknown[]) => authMock(...a) };
});
vi.mock("@/lib/tenantStore", () => ({ findOrCreateTenantByNalaniaga: (...a: unknown[]) => tenantMock(...a) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateMock(...a),
  clientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/devices", () => ({ listDevicesForTenant: (...a: unknown[]) => deviceMock(...a) }));

const claims = {
  storeId: "store-1",
  storeName: "Toko A",
  callbackUrl: "https://x.nalaniaga.id/api/webhooks/pintasend/callback",
  webhookUrl: "https://x.nalaniaga.id/api/webhooks/whatsapp",
  jti: "jti-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ claims });
  tenantMock.mockResolvedValue({ id: "ten-1" });
  rateMock.mockResolvedValue({ allowed: true });
  deviceMock.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

function post(over: Record<string, unknown> = {}) {
  return POST(
    new Request("http://x/api/connect/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tok", ...over }),
    }),
  );
}

describe("POST /api/connect/verify", () => {
  it("token valid → find-or-create tenant + deviceReady null bila belum ada device", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, storeName: "Toko A", tenantId: "ten-1", deviceReady: null });
    expect(tenantMock).toHaveBeenCalledWith("store-1", "Toko A");
  });

  it("tenant sudah punya device ready → deviceReady terisi (wizard skip QR)", async () => {
    deviceMock.mockResolvedValue([{ id: "dev1", label: "HP", phone: "6281", status: "ready" }]);
    const body = await (await post()).json();
    expect(body.deviceReady).toMatchObject({ id: "dev1", status: "ready" });
  });

  it("auth gagal → 401", async () => {
    authMock.mockResolvedValue(new Response("no", { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
  });

  it("rate limit → 429", async () => {
    rateMock.mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const res = await post();
    expect(res.status).toBe(429);
  });
});
