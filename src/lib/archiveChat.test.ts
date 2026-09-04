import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeArchiveChat } from "./archiveChat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { archiveChat: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-arch-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.archiveChat).mockResolvedValue({ success: true }); });

describe("executeArchiveChat", () => {
  it("archive → panggil OpenWA", async () => {
    const r = await executeArchiveChat({ chatId: "6281234567890", archive: true }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { archived: true } });
    expect(openwa.archiveChat).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", true);
  });
  it("unarchive → false", async () => {
    await executeArchiveChat({ chatId: "6281234567890", archive: false }, ctx);
    expect(openwa.archiveChat).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", false);
  });
  it("chatId invalid → 400", async () => {
    const r = await executeArchiveChat({ chatId: "abc", archive: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeArchiveChat({ chatId: "6281234567890", archive: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.archiveChat).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeArchiveChat({ chatId: "6281234567890", archive: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
