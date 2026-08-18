import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const authMock = vi.fn();
const createMock = vi.fn();
const rateMock = vi.fn();
const tenantMock = vi.fn();

vi.mock("@/lib/nalaniagaSso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nalaniagaSso")>();
  return { ...actual, authenticateConnect: (...a: unknown[]) => authMock(...a) };
});
vi.mock("@/lib/devices", () => ({ createDeviceAndStart: (...a: unknown[]) => createMock(...a) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateMock(...a),
  clientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/tenantStore", () => ({ findOrCreateTenantByNalaniaga: (...a: unknown[]) => tenantMock(...a) }));

const claims = { storeId: "store-1", storeName: "Toko A", callbackUrl: "https://x/cb", webhookUrl: "https://x/wh", jti: "j1" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ claims });
  createMock.mockResolvedValue({ id: "dev1", openwaSessionId: "owa-1", status: "created" });
  rateMock.mockResolvedValue({ allowed: true });
  tenantMock.mockResolvedValue({ id: "ten-1" });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/connect/device", () => {
  it("token valid → buat device utk tenant hasil token", async () => {
    const res = await POST(
      new Request("http://x/api/connect/device", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "tok" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, deviceId: "dev1", status: "created" });
    expect(createMock).toHaveBeenCalledWith("Integrasi NalaNiaga", "ten-1");
  });

  it("auth gagal → 401", async () => {
    authMock.mockResolvedValue(new Response("no", { status: 401 }));
    const res = await POST(new Request("http://x/api/connect/device", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});
