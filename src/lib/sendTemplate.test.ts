import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeSendTemplate } from "./sendTemplate";
import { queryOne } from "./db";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { checkMessageQuota } from "./quota";
import { insertMessageLog } from "./messageStore";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({ queryOne: vi.fn() }));
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
    openwa: { sendTemplate: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("./quota", () => ({ checkMessageQuota: vi.fn() }));
vi.mock("./messageStore", () => ({ insertMessageLog: vi.fn(async () => {}) }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-tpl-1" };

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return { id: "dev1", label: "HP Kasir", openwaSessionId: "owa-1", status: "ready", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryOne).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(checkMessageQuota).mockResolvedValue({ ok: true, used: 0, max: 100 });
  vi.mocked(openwa.sendTemplate).mockResolvedValue({ messageId: "m-tpl-1", status: "sent" });
});

afterEach(() => vi.restoreAllMocks());

describe("executeSendTemplate — sukses", () => {
  it("templateName + vars → normalisasi chatId & kirim via OpenWA + catat log", async () => {
    const result = await executeSendTemplate(
      { to: "081234567890", templateName: "pesanan_baru", vars: { orderId: "1234" } },
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true, to: "6281234567890@c.us", messageId: "m-tpl-1" } });
    expect(openwa.sendTemplate).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", {
      templateName: "pesanan_baru",
      vars: { orderId: "1234" },
    });
    expect(insertMessageLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", deviceId: "dev1", direction: "outgoing", type: "template", status: "sent" }),
    );
  });

  it("vars opsional (kosong) → tanpa vars", async () => {
    await executeSendTemplate({ to: "6281234567890", templateName: "sapaan_pelanggan" }, ctx);
    expect(openwa.sendTemplate).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", {
      templateName: "sapaan_pelanggan",
    });
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryOne).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeSendTemplate({ to: "6281234567890", templateName: "x", deviceId: "dev2" }, ctx);
    expect(openwa.sendTemplate).toHaveBeenCalledWith("owa-2", "6281234567890@c.us", { templateName: "x" });
  });
});

describe("executeSendTemplate — validasi & error", () => {
  it("nomor tidak valid → 400 (tanpa panggil OpenWA)", async () => {
    const result = await executeSendTemplate({ to: "abc", templateName: "x" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.sendTemplate).not.toHaveBeenCalled();
  });

  it("templateName kosong → 400", async () => {
    const result = await executeSendTemplate({ to: "6281234567890", templateName: "" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.sendTemplate).not.toHaveBeenCalled();
  });

  it("vars bukan objek → 400", async () => {
    const result = await executeSendTemplate(
      { to: "6281234567890", templateName: "x", vars: "a=1" as unknown as Record<string, string> },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("tanpa device ready → 409", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await executeSendTemplate({ to: "6281234567890", templateName: "x" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("kuota pesan habis → 429", async () => {
    vi.mocked(checkMessageQuota).mockResolvedValue({ ok: false, used: 100, max: 100 });
    const result = await executeSendTemplate({ to: "6281234567890", templateName: "x" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 429 });
  });

  it("rate limit → 429 dengan retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeSendTemplate({ to: "6281234567890", templateName: "x" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
  });

  it("OpenWA error → 502, pesan publik generik & log failed", async () => {
    vi.mocked(openwa.sendTemplate).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const result = await executeSendTemplate({ to: "6281234567890", templateName: "x" }, ctx);

    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
    expect(insertMessageLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
