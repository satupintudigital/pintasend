import { describe, expect, it, vi, beforeEach } from "vitest";
import { executePinMessage } from "./pinMessage";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { pinMessage: vi.fn(), unpinMessage: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-pin-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.pinMessage).mockResolvedValue({ success: true }); vi.mocked(openwa.unpinMessage).mockResolvedValue({ success: true }); });

describe("executePinMessage — pin", () => {
  it("pin default 24h → panggil OpenWA", async () => {
    const r = await executePinMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx, true);
    expect(r).toMatchObject({ ok: true, status: 200, body: { pinned: true } });
    expect(openwa.pinMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", 86400);
  });
  it("pin 7d → kirim 604800", async () => {
    await executePinMessage({ chatId: "6281234567890", messageId: "msg-1", durationSeconds: 604800 }, ctx, true);
    expect(openwa.pinMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", 604800);
  });
  it("duration invalid → 400", async () => {
    const r = await executePinMessage({ chatId: "6281234567890", messageId: "msg-1", durationSeconds: 999 }, ctx, true);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe("executePinMessage — unpin", () => {
  it("unpin → panggil OpenWA unpinMessage", async () => {
    const r = await executePinMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx, false);
    expect(r).toMatchObject({ ok: true, status: 200, body: { unpinned: true } });
    expect(openwa.unpinMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1");
  });
});

describe("executePinMessage — errors", () => {
  it("chatId invalid → 400", async () => {
    const r = await executePinMessage({ chatId: "abc", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("messageId kosong → 400", async () => {
    const r = await executePinMessage({ chatId: "6281234567890", messageId: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executePinMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.pinMessage).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executePinMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx, true);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
