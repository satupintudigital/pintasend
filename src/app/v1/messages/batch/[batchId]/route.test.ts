import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const verifyApiKeyMock = vi.fn();
const getBatchStatusMock = vi.fn();
const queryOneMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/db", () => ({ queryOne: (...a: unknown[]) => queryOneMock(...a) }));
vi.mock("@/lib/openwa", () => ({
  openwa: { getBatchStatus: (...a: unknown[]) => getBatchStatusMock(...a) },
  publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah. Coba lagi nanti.",
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  getBatchStatusMock.mockReset();
  queryOneMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  queryOneMock.mockResolvedValue({ id: "dev1", openwaSessionId: "sess-1" });
  getBatchStatusMock.mockResolvedValue({
    batchId: "batch-1",
    status: "processing",
    progress: { sent: 1, total: 2 },
  });
});

afterEach(() => vi.restoreAllMocks());

function get(batchId: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`http://x/v1/messages/batch/${batchId}`, { headers }), {
    params: Promise.resolve({ batchId }),
  });
}

describe("GET /v1/messages/batch/:batchId", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await get("batch-1");
    expect(res.status).toBe(401);
    expect(getBatchStatusMock).not.toHaveBeenCalled();
  });

  it("400 saat batchId kosong", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
  });

  it("404 saat device tidak ditemukan untuk tenant", async () => {
    queryOneMock.mockResolvedValue(undefined);
    const res = await get("batch-1");
    expect(res.status).toBe(404);
  });

  it("200 — delegasi ke OpenWA dengan session device tenant", async () => {
    const res = await get("batch-1", { authorization: "Bearer pintasend_abc" });
    expect(res.status).toBe(200);
    expect(getBatchStatusMock).toHaveBeenCalledWith("sess-1", "batch-1");
    expect(await res.json()).toEqual({ batch: { batchId: "batch-1", status: "processing", progress: { sent: 1, total: 2 } } });
  });

  it("502 saat OpenWA gagal", async () => {
    getBatchStatusMock.mockRejectedValue(new Error("gateway down"));
    const res = await get("batch-1");
    expect(res.status).toBe(502);
  });
});
