import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeReplyMessage } from "./replyMessage";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { replyMessage: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-reply-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.replyMessage).mockResolvedValue({ messageId: "reply-1" }); });

describe("executeReplyMessage", () => {
  it("reply → panggil OpenWA", async () => {
    const r = await executeReplyMessage({ chatId: "6281234567890", quotedMessageId: "orig-1", text: "Reply!" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.replyMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "orig-1", { text: "Reply!" });
  });
  it("quotedMessageId kosong → 400", async () => {
    const r = await executeReplyMessage({ chatId: "6281234567890", quotedMessageId: "", text: "Hi" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("text kosong → 400", async () => {
    const r = await executeReplyMessage({ chatId: "6281234567890", quotedMessageId: "orig-1", text: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("text terlalu panjang → 400", async () => {
    const r = await executeReplyMessage({ chatId: "6281234567890", quotedMessageId: "orig-1", text: "x".repeat(4097) }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeReplyMessage({ chatId: "6281234567890", quotedMessageId: "orig-1", text: "Hi" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.replyMessage).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeReplyMessage({ chatId: "6281234567890", quotedMessageId: "orig-1", text: "Hi" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
