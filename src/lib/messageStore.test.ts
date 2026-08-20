import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  applyMessageDeliveryStatus,
  isMessageDeliveryStatus,
  mergeMessageReaction,
  setMessageReactions,
  updateMessageDeliveryStatus,
} from "./messageStore";

// ── Mocks ───────────────────────────────────────────────────────────────────
const queryMock = vi.fn();
const queryOneMock = vi.fn();
const sleepMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => queryMock(...a),
  queryOne: (...a: unknown[]) => queryOneMock(...a),
}));
vi.mock("@/lib/delay", () => ({
  sleep: (...a: unknown[]) => sleepMock(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue([]);
  queryOneMock.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("isMessageDeliveryStatus", () => {
  it("mengenali delivered / read / failed", () => {
    expect(isMessageDeliveryStatus("delivered")).toBe(true);
    expect(isMessageDeliveryStatus("read")).toBe(true);
    expect(isMessageDeliveryStatus("failed")).toBe(true);
  });

  it("menolak sent / pending / status asing", () => {
    expect(isMessageDeliveryStatus("sent")).toBe(false);
    expect(isMessageDeliveryStatus("pending")).toBe(false);
    expect(isMessageDeliveryStatus("")).toBe(false);
    expect(isMessageDeliveryStatus("DELIVERED")).toBe(false);
  });
});

describe("applyMessageDeliveryStatus — guard forward-only", () => {
  it("delivered hanya dari sent (bukan menimpa read)", async () => {
    queryMock.mockResolvedValueOnce([{ id: "m1" }]);
    const ok = await applyMessageDeliveryStatus("t1", "m1", "delivered");
    expect(ok).toBe(true);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("$3 = 'delivered' AND status = 'sent'");
    expect(params).toEqual(["t1", "m1", "delivered"]);
  });

  it("read dari sent atau delivered", async () => {
    queryMock.mockResolvedValueOnce([{ id: "m1" }]);
    await applyMessageDeliveryStatus("t1", "m1", "read");

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("$3 = 'read' AND status IN ('sent', 'delivered')");
  });

  it("failed hanya dari sent (tidak menimpa delivered/read)", async () => {
    queryMock.mockResolvedValueOnce([{ id: "m1" }]);
    await applyMessageDeliveryStatus("t1", "m1", "failed");

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("$3 = 'failed' AND status = 'sent'");
  });

  it("0 baris berubah → false", async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await applyMessageDeliveryStatus("t1", "m1", "read")).toBe(false);
  });
});

describe("updateMessageDeliveryStatus — reconcile", () => {
  it("langsung true tanpa retry bila baris berubah", async () => {
    queryMock.mockResolvedValueOnce([{ id: "m1" }]);
    expect(await updateMessageDeliveryStatus("t1", "m1", "read")).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("retry sekali setelah delay 750ms bila pertama 0 baris", async () => {
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "m1" }]);
    expect(await updateMessageDeliveryStatus("t1", "m1", "delivered")).toBe(true);
    expect(sleepMock).toHaveBeenCalledWith(750);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});

describe("setMessageReactions — snapshot lengkap", () => {
  it("snapshot berisi → tulis JSON map & true", async () => {
    queryMock.mockResolvedValueOnce([{ id: "m1" }]);
    const ok = await setMessageReactions("t1", "m1", { "62812@c.us": "👍", "62813@c.us": "❤️" });
    expect(ok).toBe(true);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('SET reaction = $3');
    expect(params).toEqual(["t1", "m1", JSON.stringify({ "62812@c.us": "👍", "62813@c.us": "❤️" })]);
  });

  it("snapshot kosong → tulis NULL & true", async () => {
    queryMock.mockResolvedValueOnce([{ id: "m1" }]);
    await setMessageReactions("t1", "m1", {});
    const [, params] = queryMock.mock.calls[0];
    expect(params[2]).toBeNull();
  });

  it("0 baris berubah → false", async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await setMessageReactions("t1", "m1", { "62812@c.us": "👍" })).toBe(false);
  });
});

describe("mergeMessageReaction — satu sender (read-modify-write)", () => {
  it("tambah reaksi pada baris yang sudah ada", async () => {
    queryOneMock.mockResolvedValueOnce({ id: "m1", reaction: '{"62812@c.us":"👍"}' });
    await mergeMessageReaction("t1", "msg-1", "62813@c.us", "❤️");

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('SET reaction = $2');
    expect(params[1]).toBe(JSON.stringify({ "62812@c.us": "👍", "62813@c.us": "❤️" }));
  });

  it("reaction kosong → hapus sender", async () => {
    queryOneMock.mockResolvedValueOnce({ id: "m1", reaction: '{"62812@c.us":"👍","62813@c.us":"❤️"}' });
    await mergeMessageReaction("t1", "msg-1", "62813@c.us", "");

    const [, params] = queryMock.mock.calls[0];
    expect(params[1]).toBe(JSON.stringify({ "62812@c.us": "👍" }));
  });

  it("baris tidak ditemukan → false (tanpa UPDATE)", async () => {
    queryOneMock.mockResolvedValueOnce(undefined);
    expect(await mergeMessageReaction("t1", "msg-1", "62813@c.us", "👍")).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
