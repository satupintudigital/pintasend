import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAuthMock = vi.fn();
const ingestMock = vi.fn();
const dbFactoryMock = vi.fn(() => ({}));
const kv = {
  get: vi.fn(),
  put: vi.fn(),
};

vi.mock("@/lib/templateSyncAuth", () => ({ verifyTemplateSyncAuth: (...args: unknown[]) => verifyAuthMock(...args) }));
vi.mock("@/lib/templateSync", () => ({
  ingestTemplateSync: (...args: unknown[]) => ingestMock(...args),
  createTemplateSyncDb: () => dbFactoryMock(),
}));
vi.mock("@/lib/cf", () => ({ getBinding: vi.fn(async () => kv) }));

import { POST } from "./route";

const payload = {
  nalaniagaStoreId: "store-1",
  event: "NEW_ORDER",
  version: 4,
  checksum: "checksum-4",
  template: { name: "pesanan_baru", body: "Halo {{recipientName}}" },
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyAuthMock.mockResolvedValue(true);
  kv.get.mockResolvedValue(null);
  ingestMock.mockResolvedValue({ ok: true, tenantId: "tenant-1", devices: 2, jobs: 2 });
});

describe("POST /internal/nalaniaga/template-sync", () => {
  it("memverifikasi auth, mengunci nonce, lalu ingest payload", async () => {
    const body = JSON.stringify(payload);
    const response = await POST(new Request("http://x/internal/nalaniaga/template-sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-template-sync-timestamp": "1724320000000",
        "x-template-sync-signature": "sha256:test",
        "x-template-sync-nonce": "nonce-01",
      },
      body,
    }));

    expect(response.status).toBe(202);
    expect(verifyAuthMock).toHaveBeenCalledWith("", "1724320000000", "sha256:test", body);
    expect(kv.put).toHaveBeenCalledWith("template-sync:nonce-01", "1", { expirationTtl: 600 });
    expect(dbFactoryMock).toHaveBeenCalled();
    expect(ingestMock).toHaveBeenCalledWith(expect.anything(), payload);
    await expect(response.json()).resolves.toMatchObject({ ok: true, devices: 2, jobs: 2 });
  });

  it("menolak nonce yang pernah dipakai", async () => {
    kv.get.mockResolvedValue("1");
    const response = await POST(new Request("http://x/internal/nalaniaga/template-sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-template-sync-timestamp": "1724320000000",
        "x-template-sync-signature": "sha256:test",
        "x-template-sync-nonce": "nonce-replay",
      },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(409);
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
