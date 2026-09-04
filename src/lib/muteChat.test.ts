import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeMuteChat } from "./muteChat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { muteChat: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-mute-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.muteChat).mockResolvedValue({ success: true }); });

describe("executeMuteChat", () => {
  it("mute → panggil OpenWA", async () => {
    const r = await executeMuteChat({ chatId: "6281234567890", muteUntil: 1800000000000 }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { muted: true } });
    expect(openwa.muteChat).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", 1800000000000);
  });
  it("unmute (muteUntil=null) → panggil OpenWA", async () => {
    const r = await executeMuteChat({ chatId: "6281234567890", muteUntil: null }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { muted: false, muteUntil: null } });
  });
  it("chatId invalid → 400", async () => {
    const r = await executeMuteChat({ chatId: "abc", muteUntil: 1800000000000 }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeMuteChat({ chatId: "6281234567890", muteUntil: 1800000000000 }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.muteChat).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeMuteChat({ chatId: "6281234567890", muteUntil: 1800000000000 }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
