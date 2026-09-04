import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeForwardMessage } from "./forwardMessage";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { forwardMessage: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-fwd-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.forwardMessage).mockResolvedValue({ messageId: "new-1" }); });

describe("executeForwardMessage", () => {
  it("forward → panggil OpenWA dengan from/to/chatId", async () => {
    const r = await executeForwardMessage({ fromChatId: "628111111111", toChatId: "628222222222", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.forwardMessage).toHaveBeenCalledWith("owa-1", "628111111111@c.us", "628222222222@c.us", "msg-1");
  });
  it("fromChatId invalid → 400", async () => {
    const r = await executeForwardMessage({ fromChatId: "abc", toChatId: "628222222222", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("toChatId invalid → 400", async () => {
    const r = await executeForwardMessage({ fromChatId: "628111111111", toChatId: "abc", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("messageId kosong → 400", async () => {
    const r = await executeForwardMessage({ fromChatId: "628111111111", toChatId: "628222222222", messageId: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeForwardMessage({ fromChatId: "628111111111", toChatId: "628222222222", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.forwardMessage).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeForwardMessage({ fromChatId: "628111111111", toChatId: "628222222222", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
