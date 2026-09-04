import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeStarMessage } from "./starMessage";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { starMessage: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-star-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.starMessage).mockResolvedValue({ success: true }); });

describe("executeStarMessage", () => {
  it("star=true → panggil OpenWA", async () => {
    const r = await executeStarMessage({ chatId: "6281234567890", messageId: "msg-1", star: true }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { starred: true } });
    expect(openwa.starMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", true);
  });
  it("star=false → unstar", async () => {
    await executeStarMessage({ chatId: "6281234567890", messageId: "msg-1", star: false }, ctx);
    expect(openwa.starMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", false);
  });
  it("chatId invalid → 400", async () => {
    const r = await executeStarMessage({ chatId: "abc", messageId: "msg-1", star: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("messageId kosong → 400", async () => {
    const r = await executeStarMessage({ chatId: "6281234567890", messageId: "", star: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeStarMessage({ chatId: "6281234567890", messageId: "msg-1", star: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.starMessage).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeStarMessage({ chatId: "6281234567890", messageId: "msg-1", star: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
