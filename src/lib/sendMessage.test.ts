import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeSendMessage } from "./sendMessage";
import { openwa, OpenwaError } from "./openwa";
import { queryOne } from "./db";
import { checkMessageQuota } from "./quota";
import { checkRateLimit } from "./rate-limit";
import { getTenantDelayInfo, sleep } from "./delay";
import { insertMessageLog } from "./messageStore";

// ── Mocks ───────────────────────────────────────────────────────────────────
// Fake KV WAVIO_CACHE — state bertahan antar panggilan (persist dalam test),
// dipakai jalur idempotency.
const fakeKv = {
  store: new Map<string, string>(),
  get: vi.fn(async (k: string) => fakeKv.store.get(k) ?? null),
  put: vi.fn(async (k: string, v: string) => {
    fakeKv.store.set(k, v);
  }),
};
vi.mock("@/lib/cf", () => ({
  getBinding: vi.fn(async (name: string) => {
    if (name === "WAVIO_CACHE") return fakeKv;
    throw new Error(`binding ${name} tidak ada`);
  }),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/openwa", () => {
  class MockOpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "OpenwaError";
      this.status = status;
    }
  }
  return {
    openwa: { sendText: vi.fn(), sendMedia: vi.fn() },
    OPENWA_MEDIA_TYPES: ["image", "video", "audio", "document", "sticker"],
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("@/lib/quota", () => ({ checkMessageQuota: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/delay", () => ({
  getTenantDelayInfo: vi.fn(),
  randomDelayMs: vi.fn(() => 5000),
  sleep: vi.fn(),
}));
vi.mock("@/lib/messageStore", () => ({ insertMessageLog: vi.fn(async () => {}) }));
vi.mock("@/lib/r2", () => ({ putMediaObject: vi.fn(async () => {}) }));

// ── Helpers ──────────────────────────────────────────────────────────────────
const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-test-1" };

afterEach(() => vi.restoreAllMocks());

function jsonReq(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request("http://x/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return {
    id: "dev1",
    label: "HP Kasir",
    openwaSessionId: "owa-1",
    status: "ready",
    ...over,
  };
}

const defaultMocks = () => {
  vi.mocked(queryOne).mockResolvedValue(readyDevice());
  vi.mocked(checkMessageQuota).mockResolvedValue({ ok: true, used: 0, max: 100 });
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(getTenantDelayInfo).mockResolvedValue({ enabled: false, entitled: false, active: false });
  vi.mocked(openwa.sendText).mockResolvedValue({ messageId: "m1", status: "sent" });
};

beforeEach(() => {
  fakeKv.store.clear();
  vi.clearAllMocks();
  defaultMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe("executeSendMessage — kirim teks sukses", () => {
  it("mengirim teks via OpenWA & mencatat pesan keluar", async () => {
    const result = await executeSendMessage(jsonReq({ to: "081234567890", text: "Halo" }), ctx);

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true, to: "6281234567890@c.us", messageId: "m1" } });
    expect(openwa.sendText).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "Halo");
    expect(insertMessageLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", deviceId: "dev1", direction: "outgoing", status: "sent", messageId: "m1" }),
    );
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryOne).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeSendMessage(jsonReq({ to: "6281234567890", text: "x", deviceId: "dev2" }), ctx);

    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), ["dev2", "t1"]);
    expect(openwa.sendText).toHaveBeenCalledWith("owa-2", "6281234567890@c.us", "x");
  });
});

describe("executeSendMessage — validasi & error", () => {
  it("nomor tidak valid → 400", async () => {
    const result = await executeSendMessage(jsonReq({ to: "abc", text: "x" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("text kosong tanpa media → 400", async () => {
    const result = await executeSendMessage(jsonReq({ to: "6281234567890" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("text > 4096 karakter → 400", async () => {
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x".repeat(4097) }), ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("tanpa device ready → 409", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("deviceId tidak ditemukan → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x", deviceId: "nope" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("device tidak siap (status disconnected) → 409", async () => {
    vi.mocked(queryOne).mockResolvedValue(readyDevice({ status: "disconnected" }));
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("kuota pesan habis → 429", async () => {
    vi.mocked(checkMessageQuota).mockResolvedValue({ ok: false, used: 100, max: 100 });
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 429 });
  });

  it("rate limit per API key → 429 dengan retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);

    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
    // Key rate limit memakai keyId, bukan tenant+IP.
    const [rlKey] = vi.mocked(checkRateLimit).mock.calls[0];
    expect(rlKey).toContain("k1");
  });

  it("OpenWA error → 502, pesan publik generik (tanpa detail internal) & pesan gagal dicatat", async () => {
    vi.mocked(openwa.sendText).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);

    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      // Detail internal (host/port) TIDAK bocor ke publik.
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).not.toContain("Connection refused");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
    expect(insertMessageLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});

describe("executeSendMessage — media", () => {
  it("media via URL → sendMedia dengan url", async () => {
    vi.mocked(openwa.sendMedia).mockResolvedValue({ messageId: "m2" });
    const result = await executeSendMessage(
      jsonReq({ to: "6281234567890", mediaType: "image", mediaUrl: "https://cdn.example.com/a.jpg", text: "caption" }),
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200, body: { mediaType: "image" } });
    expect(openwa.sendMedia).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "image", { url: "https://cdn.example.com/a.jpg", caption: "caption" });
  });
});

describe("executeSendMessage — mentions (mention pengguna di grup)", () => {
  it("mentions diteruskan ke OpenWA sebagai JID @c.us (normalisasi 08… → 62…)", async () => {
    const result = await executeSendMessage(
      jsonReq({
        to: "120363024123456789@g.us",
        text: "@6281234567890 @6282222222222 silakan cek",
        mentions: ["081234567890", "6282222222222"],
      }),
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(openwa.sendText).toHaveBeenCalledWith("owa-1", "120363024123456789@g.us", "@6281234567890 @6282222222222 silakan cek", {
      mentions: ["6281234567890@c.us", "6282222222222@c.us"],
    });
  });

  it("mentions di media → diteruskan ke sendMedia", async () => {
    vi.mocked(openwa.sendMedia).mockResolvedValue({ messageId: "m2" });
    const result = await executeSendMessage(
      jsonReq({
        to: "120363024123456789@g.us",
        mediaType: "image",
        mediaUrl: "https://cdn.example.com/a.jpg",
        text: "@6281234567890 foto",
        mentions: ["081234567890"],
      }),
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(openwa.sendMedia).toHaveBeenCalledWith("owa-1", "120363024123456789@g.us", "image", {
      url: "https://cdn.example.com/a.jpg",
      caption: "@6281234567890 foto",
      mentions: ["6281234567890@c.us"],
    });
  });

  it("nomor mention tidak valid → 400 (tanpa kirim)", async () => {
    const result = await executeSendMessage(
      jsonReq({ to: "120363024123456789@g.us", text: "halo", mentions: ["abc"] }),
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.sendText).not.toHaveBeenCalled();
  });
});

describe("executeSendMessage — reply (quotedMessageId)", () => {
  it("replyTo diteruskan sebagai quotedMessageId ke sendText", async () => {
    const result = await executeSendMessage(
      jsonReq({ to: "6281234567890", text: "Baik, terima kasih", replyTo: "true_62812…_3EB0ABCD" }),
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(openwa.sendText).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "Baik, terima kasih", {
      replyTo: "true_62812…_3EB0ABCD",
    });
  });

  it("replyTo + mentions bersamaan → keduanya diteruskan", async () => {
    const result = await executeSendMessage(
      jsonReq({
        to: "120363024123456789@g.us",
        text: "@6281234567890 oke",
        mentions: ["081234567890"],
        replyTo: "true_…_ABC",
      }),
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(openwa.sendText).toHaveBeenCalledWith("owa-1", "120363024123456789@g.us", "@6281234567890 oke", {
      mentions: ["6281234567890@c.us"],
      replyTo: "true_…_ABC",
    });
  });
});

describe("executeSendMessage — idempotency", () => {
  it("replay: key sama + body sama → respons asli, TANPA kirim ulang", async () => {
    const body = { to: "6281234567890", text: "Halo" };
    const req1 = jsonReq(body, { "idempotency-key": "order-12345" });
    const req2 = jsonReq(body, { "idempotency-key": "order-12345" });

    const first = await executeSendMessage(req1, ctx);
    expect(first.ok).toBe(true);
    expect(openwa.sendText).toHaveBeenCalledTimes(1);

    const second = await executeSendMessage(req2, ctx);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.body.messageId).toBe(first.body.messageId);
      expect(second.headers?.["x-wavio-idempotent-replay"]).toBe("true");
    }
    // Tidak ada kirim kedua ke OpenWA & tidak menghabiskan kuota/rate limit.
    expect(openwa.sendText).toHaveBeenCalledTimes(1);
    expect(checkMessageQuota).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it("key sama + payload berbeda → 400 (tidak kirim)", async () => {
    await executeSendMessage(jsonReq({ to: "6281234567890", text: "Halo" }, { "idempotency-key": "order-12345" }), ctx);
    const result = await executeSendMessage(
      jsonReq({ to: "6281234567890", text: "Halo BERBEDA" }, { "idempotency-key": "order-12345" }),
      ctx,
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.sendText).toHaveBeenCalledTimes(1);
  });

  it("Idempotency-Key format tidak valid → 400", async () => {
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }, { "idempotency-key": "pendek!" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.sendText).not.toHaveBeenCalled();
  });

  it("kirim gagal → key TIDAK direkam (retry diperbolehkan)", async () => {
    vi.mocked(openwa.sendText).mockRejectedValueOnce(new OpenwaError(502, "down"))
      .mockResolvedValueOnce({ messageId: "m9", status: "sent" });

    const req = () => jsonReq({ to: "6281234567890", text: "Halo" }, { "idempotency-key": "order-12345" });
    const failed = await executeSendMessage(req(), ctx);
    expect(failed).toMatchObject({ ok: false, status: 502 });

    const retried = await executeSendMessage(req(), ctx);
    expect(retried).toMatchObject({ ok: true, status: 200 });
    expect(openwa.sendText).toHaveBeenCalledTimes(2);
  });
});

describe("executeSendMessage — delay anti-spam", () => {
  it("delay aktif → sleep dipanggil & delayMs disertakan", async () => {
    vi.mocked(getTenantDelayInfo).mockResolvedValue({ enabled: true, entitled: true, active: true });
    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);

    expect(sleep).toHaveBeenCalledWith(5000);
    expect(result).toMatchObject({ ok: true, status: 200, body: { delayMs: 5000 } });
  });
});

describe("executeSendMessage — structured logging (requestId korelasi)", () => {
  it("sukses → log info send_success dengan requestId + konteks", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "Halo" }), ctx);
    expect(result).toMatchObject({ ok: true, status: 200 });

    const lines = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const ev = lines.find((l) => l.event === "send_success");
    expect(ev).toMatchObject({
      level: "info",
      requestId: "req-test-1",
      tenantId: "t1",
      deviceId: "dev1",
      chatId: "6281234567890@c.us",
      messageId: "m1",
    });
    expect(typeof ev.timestamp).toBe("string");
  });

  it("rate limit → log warn send_rate_limited dengan keyId & retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);

    const lines = warn.mock.calls.map((c) => JSON.parse(c[0] as string));
    const ev = lines.find((l) => l.event === "send_rate_limited");
    expect(ev).toMatchObject({ requestId: "req-test-1", tenantId: "t1", keyId: "k1", retryAfterSec: 30 });
  });

  it("OpenWA error → log error send_failed: detail internal DI LOG, requestId sama", async () => {
    vi.mocked(openwa.sendText).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await executeSendMessage(jsonReq({ to: "6281234567890", text: "x" }), ctx);
    expect(result).toMatchObject({ ok: false, status: 502 });

    const lines = err.mock.calls.map((c) => JSON.parse(c[0] as string));
    const ev = lines.find((l) => l.event === "send_failed");
    expect(ev).toMatchObject({ requestId: "req-test-1", tenantId: "t1", openwaStatus: 502 });
    // Detail internal tersedia untuk debugging (di log, bukan di respons publik).
    expect(JSON.stringify(ev)).toContain("10.0.0.5");
  });
});
