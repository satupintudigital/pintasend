import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeListGroups } from "./listGroups";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class MockOpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "OpenwaError";
      this.status = status;
    }
  }
  return {
    openwa: { listGroups: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-groups-1" };

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return { id: "dev1", label: "HP Kasir", openwaSessionId: "owa-1", status: "ready", ...over };
}

const groupFixtures = [
  { id: "120363024@g.us", name: "Tim Engineering", participantsCount: 42, isAdmin: true, linkedParentJID: null },
  { id: "120363099@g.us", name: "Komunitas Pelanggan", linkedParentJID: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryD1One).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.listGroups).mockResolvedValue(groupFixtures);
});

afterEach(() => vi.restoreAllMocks());

describe("executeListGroups — sukses", () => {
  it("tanpa deviceId → list via OpenWA & balas groups + count", async () => {
    const result = await executeListGroups({}, ctx);

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: { ok: true, deviceId: "dev1", count: 2, groups: groupFixtures },
    });
    expect(openwa.listGroups).toHaveBeenCalledWith("owa-1", undefined, undefined);
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryD1One).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeListGroups({ deviceId: "dev2" }, ctx);

    expect(queryD1One).toHaveBeenCalledWith(expect.stringContaining("WHERE id = ?"), ["dev2", "t1"]);
    expect(openwa.listGroups).toHaveBeenCalledWith("owa-2", undefined, undefined);
  });

  it("meneruskan limit & offset (dengan clamp 1-1000)", async () => {
    await executeListGroups({ limit: 5000, offset: -3 }, ctx);
    expect(openwa.listGroups).toHaveBeenCalledWith("owa-1", 1000, 0);
  });

  it("respons bukan array → tetap 200 dengan groups []", async () => {
    vi.mocked(openwa.listGroups).mockResolvedValue(undefined as unknown as never);
    const result = await executeListGroups({}, ctx);
    expect(result).toMatchObject({ ok: true, status: 200, body: { count: 0, groups: [] } });
  });
});

describe("executeListGroups — validasi & error", () => {
  it("tanpa device ready → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const result = await executeListGroups({}, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(openwa.listGroups).not.toHaveBeenCalled();
  });

  it("deviceId tidak ditemukan → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const result = await executeListGroups({ deviceId: "nope" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("device tidak siap → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(readyDevice({ status: "disconnected" }));
    const result = await executeListGroups({}, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429 dengan retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeListGroups({}, ctx);
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
    expect(openwa.listGroups).not.toHaveBeenCalled();
  });

  it("OpenWA error → 502, pesan publik generik (tanpa detail internal)", async () => {
    vi.mocked(openwa.listGroups).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const result = await executeListGroups({}, ctx);

    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).not.toContain("Connection refused");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
  });
});
