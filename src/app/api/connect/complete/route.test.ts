import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const authMock = vi.fn();
const tenantMock = vi.fn();
const deviceMock = vi.fn();
const listKeysMock = vi.fn();
const revokeMock = vi.fn();
const createKeyMock = vi.fn();
const upsertWhMock = vi.fn();
const genSecretMock = vi.fn();
const deliverMock = vi.fn();
const rateMock = vi.fn();

vi.mock("@/lib/nalaniagaSso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nalaniagaSso")>();
  return {
    ...actual,
    authenticateConnect: (...a: unknown[]) => authMock(...a),
    deliverConnectCallback: (...a: unknown[]) => deliverMock(...a),
  };
});
vi.mock("@/lib/tenantStore", () => ({ findOrCreateTenantByNalaniaga: (...a: unknown[]) => tenantMock(...a) }));
vi.mock("@/lib/devices", () => ({
  getDeviceForTenant: (...a: unknown[]) => deviceMock(...a),
  listDevicesForTenant: vi.fn(async () => []),
}));
vi.mock("@/lib/authStore", () => ({
  listApiKeys: (...a: unknown[]) => listKeysMock(...a),
  revokeApiKey: (...a: unknown[]) => revokeMock(...a),
  createApiKey: (...a: unknown[]) => createKeyMock(...a),
}));
vi.mock("@/lib/webhookStore", () => ({
  upsertWebhook: (...a: unknown[]) => upsertWhMock(...a),
  generateWebhookSecret: (...a: unknown[]) => genSecretMock(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateMock(...a),
  clientIp: () => "1.2.3.4",
}));

const fakeKv = {
  store: new Map<string, string>(),
  get: vi.fn(async (k: string) => fakeKv.store.get(k) ?? null),
  put: vi.fn(async (k: string, v: string) => {
    fakeKv.store.set(k, v);
  }),
};
vi.mock("@/lib/cf", () => ({
  getBinding: vi.fn(async (name: string) => {
    if (name === "PINTSEND_CACHE") return fakeKv;
    throw new Error("no binding");
  }),
}));

const claims = {
  storeId: "store-1",
  storeName: "Toko A",
  callbackUrl: "https://x.nalaniaga.id/api/webhooks/pintasend/callback",
  webhookUrl: "https://x.nalaniaga.id/api/webhooks/whatsapp",
  jti: "jti-1",
};

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/connect/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeKv.store.clear();
  authMock.mockResolvedValue({ claims });
  tenantMock.mockResolvedValue({ id: "ten-1" });
  deviceMock.mockResolvedValue({
    id: "dev1",
    tenantId: "ten-1",
    label: "Integrasi NalaNiaga",
    openwaSessionId: "owa-1",
    openwaWebhookId: null,
    phone: null,
    status: "ready",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  });
  listKeysMock.mockResolvedValue([]);
  revokeMock.mockResolvedValue({ revoked: true, d1Ok: true });
  createKeyMock.mockResolvedValue({ id: "key1", raw: "pintasend_abc", prefix: "pintasend_", d1Ok: true });
  upsertWhMock.mockResolvedValue({ id: "wh1" });
  genSecretMock.mockReturnValue("secret-hex");
  deliverMock.mockResolvedValue({ ok: true, status: 200 });
  rateMock.mockResolvedValue({ allowed: true });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/connect/complete", () => {
  it("device ready → cabut key lama + buat key + webhook + callback, idempotent per jti", async () => {
    const res = await post({ token: "tok", deviceId: "dev1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, callbackOk: true, deviceId: "dev1" });
    expect(createKeyMock).toHaveBeenCalledWith({ tenantId: "ten-1", label: "Integrasi NalaNiaga" });
    expect(upsertWhMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "ten-1",
        url: claims.webhookUrl,
        events: ["message.received", "session.status"],
      }),
    );
    expect(deliverMock).toHaveBeenCalledTimes(1);

    // Idempotent: panggil kedua → tidak buat key baru, gunakan hasil tersimpan.
    const res2 = await post({ token: "tok", deviceId: "dev1" });
    expect((await res2.json()).ok).toBe(true);
    expect(createKeyMock).toHaveBeenCalledTimes(1);
  });

  it("key lama berlabel Integrasi NalaNiaga dicabut sebelum key baru", async () => {
    listKeysMock.mockResolvedValue([
      { id: "old1", tenantId: "ten-1", label: "Integrasi NalaNiaga", prefix: "pintasend_", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, revokedAt: null },
      { id: "other", tenantId: "ten-1", label: "Bot CS", prefix: "pintasend_", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, revokedAt: null },
    ]);
    await post({ token: "tok", deviceId: "dev1" });
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(revokeMock).toHaveBeenCalledWith("old1", "ten-1");
  });

  it("device belum ready → 409 tanpa efek samping", async () => {
    deviceMock.mockResolvedValue({
      id: "dev1", tenantId: "ten-1", label: "x", openwaSessionId: "owa-1",
      openwaWebhookId: null, phone: null, status: "created",
      createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z",
    });
    const res = await post({ token: "tok", deviceId: "dev1" });
    expect(res.status).toBe(409);
    expect(createKeyMock).not.toHaveBeenCalled();
  });

  it("deviceId tidak milik tenant → 404", async () => {
    deviceMock.mockResolvedValue(undefined);
    const res = await post({ token: "tok", deviceId: "nope" });
    expect(res.status).toBe(404);
  });

  it("callback gagal → 502 tapi key tetap terbit (bisa ulang dari NalaNiaga)", async () => {
    deliverMock.mockResolvedValue({ ok: false, status: 502 });
    const res = await post({ token: "tok", deviceId: "dev1" });
    expect(res.status).toBe(502);
    expect(createKeyMock).toHaveBeenCalledTimes(1);
  });
});
