import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeListChats } from "./listChats";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class E extends Error { status: number; constructor(s: number, m: string) { super(m); this.name = "OpenwaError"; this.status = s; } }
  return { openwa: { listChats: vi.fn() }, OpenwaError: E, publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah." };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-chats-1" };
const dev = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryD1One).mockResolvedValue(dev);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.listChats).mockResolvedValue([
    { id: "6281234567890@c.us", name: "Alice", kind: "individual", unreadCount: 2, timestamp: 1719306115 },
    { id: "120363024123@g.us", name: "Project Team", kind: "group", unreadCount: 0, timestamp: 1719306100 },
  ]);
});

describe("executeListChats", () => {
  it("list chats → return chats with kind", async () => {
    const r = await executeListChats({}, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      const chats = body.chats as Array<Record<string, unknown>>;
      expect(chats).toHaveLength(2);
      expect(chats[0]).toMatchObject({ kind: "individual" });
      expect(chats[1]).toMatchObject({ kind: "group" });
    }
  });
  it("limit/offset diteruskan", async () => {
    await executeListChats({ limit: 5, offset: 10 }, ctx);
    expect(openwa.listChats).toHaveBeenCalledWith("owa-1", { limit: 5, offset: 10 });
  });
  it("limit dibatasi 1-1000", async () => {
    await executeListChats({ limit: 0 }, ctx);
    expect(openwa.listChats).toHaveBeenCalledWith("owa-1", { limit: 1, offset: 0 });
    await executeListChats({ limit: 9999 }, ctx);
    expect(openwa.listChats).toHaveBeenCalledWith("owa-1", { limit: 1000, offset: 0 });
  });
  it("no device → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeListChats({}, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.listChats).mockRejectedValue(new OpenwaError(502, "down"));
    const r = await executeListChats({}, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
