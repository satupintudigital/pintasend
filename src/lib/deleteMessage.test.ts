import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeDeleteMessage } from "./deleteMessage";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class MockOpenwaError extends Error {
    status: number;
    constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; }
  }
  return { openwa: { deleteMessage: vi.fn() }, OpenwaError: MockOpenwaError, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-del-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(queryD1One).mockResolvedValue(dev); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); vi.mocked(openwa.deleteMessage).mockResolvedValue({ success: true }); });

describe("executeDeleteMessage", () => {
  it("delete for everyone → panggil OpenWA", async () => {
    const r = await executeDeleteMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.deleteMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", true);
  });
  it("forEveryone=false → kirim false", async () => {
    await executeDeleteMessage({ chatId: "6281234567890", messageId: "msg-1", forEveryone: false }, ctx);
    expect(openwa.deleteMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", false);
  });
  it("chatId invalid → 400", async () => {
    const r = await executeDeleteMessage({ chatId: "abc", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("messageId kosong → 400", async () => {
    const r = await executeDeleteMessage({ chatId: "6281234567890", messageId: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeDeleteMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.deleteMessage).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeDeleteMessage({ chatId: "6281234567890", messageId: "msg-1" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
