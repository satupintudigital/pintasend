import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

const verifyApiKeyMock = vi.fn();
const createRetentionRequestMock = vi.fn();
const hasPendingRetentionRequestMock = vi.fn();
const getTenantRetentionDaysMock = vi.fn();
const listRetentionRequestsMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/retention", () => ({
  createRetentionRequest: (...args: unknown[]) => createRetentionRequestMock(...args),
  hasPendingRetentionRequest: (...args: unknown[]) => hasPendingRetentionRequestMock(...args),
  getTenantRetentionDays: (...args: unknown[]) => getTenantRetentionDaysMock(...args),
  listRetentionRequests: (...args: unknown[]) => listRetentionRequestsMock(...args),
  DEFAULT_MESSAGE_RETENTION_DAYS: 30,
  MAX_MESSAGE_RETENTION_DAYS: 365,
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  createRetentionRequestMock.mockReset();
  hasPendingRetentionRequestMock.mockReset();
  getTenantRetentionDaysMock.mockReset();
  listRetentionRequestsMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  hasPendingRetentionRequestMock.mockResolvedValue(false);
  createRetentionRequestMock.mockResolvedValue({
    id: "r1",
    tenantId: "t1",
    requestedBy: "api-key:k1",
    reason: "Arsip 6 bulan",
    retentionDays: 180,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  });
  getTenantRetentionDaysMock.mockResolvedValue(30);
  listRetentionRequestsMock.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request("http://x/v1/retention-requests", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer pintasend_abc" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /v1/retention-requests", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post({ reason: "Arsip", retentionDays: 60 });
    expect(res.status).toBe(401);
    expect(createRetentionRequestMock).not.toHaveBeenCalled();
  });

  it("400 saat alasan kosong", async () => {
    const res = await post({ reason: "", retentionDays: 60 });
    expect(res.status).toBe(400);
    expect(createRetentionRequestMock).not.toHaveBeenCalled();
  });

  it("400 saat retentionDays di luar 30..365", async () => {
    const res = await post({ reason: "Arsip", retentionDays: 10 });
    expect(res.status).toBe(400);
    expect(createRetentionRequestMock).not.toHaveBeenCalled();
  });

  it("409 saat sudah ada permintaan pending", async () => {
    hasPendingRetentionRequestMock.mockResolvedValue(true);
    const res = await post({ reason: "Arsip", retentionDays: 60 });
    expect(res.status).toBe(409);
    expect(createRetentionRequestMock).not.toHaveBeenCalled();
  });

  it("201 — catat permintaan dengan requestedBy = api-key:<keyId>", async () => {
    const res = await post({ reason: "Arsip 6 bulan", retentionDays: 180 });
    expect(res.status).toBe(201);
    expect(createRetentionRequestMock).toHaveBeenCalledWith({
      tenantId: "t1",
      requestedBy: "api-key:k1",
      reason: "Arsip 6 bulan",
      retentionDays: 180,
    });
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  it("body bukan JSON → 400", async () => {
    const res = await POST(
      new Request("http://x/v1/retention-requests", {
        method: "POST",
        headers: { authorization: "Bearer pintasend_abc" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    expect(createRetentionRequestMock).not.toHaveBeenCalled();
  });
});

describe("GET /v1/retention-requests", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/v1/retention-requests"));
    expect(res.status).toBe(401);
  });

  it("200 — nilai retensi + daftar permintaan tenant", async () => {
    getTenantRetentionDaysMock.mockResolvedValue(90);
    listRetentionRequestsMock.mockResolvedValue([
      { id: "r1", retentionDays: 90, status: "approved" },
    ]);
    const res = await GET(new Request("http://x/v1/retention-requests"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retentionDays).toBe(90);
    expect(body.defaultRetentionDays).toBe(30);
    expect(body.maxRetentionDays).toBe(365);
    expect(body.requests).toEqual([{ id: "r1", retentionDays: 90, status: "approved" }]);
  });
});
