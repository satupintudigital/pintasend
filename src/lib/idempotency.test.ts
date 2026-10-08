import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getIdempotencyRecord,
  setIdempotencyRecord,
  isValidIdempotencyKey,
  hashBody,
} from "./idempotency";

// Fake KV binding PINTSEND_CACHE — state bertahan antar panggilan (persist dalam test).
const fakeKv = {
  store: new Map<string, string>(),
  get: vi.fn(async (k: string) => fakeKv.store.get(k) ?? null),
  put: vi.fn(async (k: string, v: string) => {
    fakeKv.store.set(k, v);
  }),
};

vi.mock("@/lib/cf", () => ({
  getBinding: vi.fn(async (name: string) => {
    if (name === "PINTSEND_CACHE") return fakeKv;
    throw new Error(`binding ${name} tidak ada`);
  }),
}));

describe("idempotency — KV-backed Idempotency-Key", () => {
  beforeEach(() => {
    fakeKv.store.clear();
    vi.clearAllMocks();
  });

  it("set lalu get mengembalikan record yang sama", async () => {
    const record = { bodyHash: "abc123", response: { ok: true, messageId: "m1" } };
    await setIdempotencyRecord("t1", "order-123", record);
    expect(await getIdempotencyRecord("t1", "order-123")).toEqual(record);
  });

  it("get key yang belum pernah disimpan → null", async () => {
    expect(await getIdempotencyRecord("t1", "order-123")).toBeNull();
  });

  it("record terisolasi per tenant (key sama, tenant beda → null)", async () => {
    await setIdempotencyRecord("t1", "order-123", {
      bodyHash: "h",
      response: { ok: true },
    });
    expect(await getIdempotencyRecord("t2", "order-123")).toBeNull();
  });

  it("data korup di KV → null (bukan error)", async () => {
    fakeKv.store.set("idem:t1:order-123", "not-json");
    expect(await getIdempotencyRecord("t1", "order-123")).toBeNull();
  });

  it("isValidIdempotencyKey menerima key valid (8–128, huruf/angka/._-)", () => {
    expect(isValidIdempotencyKey("order-12345")).toBe(true);
    expect(isValidIdempotencyKey("a".repeat(128))).toBe(true);
  });

  it("isValidIdempotencyKey menolak key pendek/panjang/karakter aneh", () => {
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("short")).toBe(false); // < 8
    expect(isValidIdempotencyKey("a".repeat(129))).toBe(false); // > 128
    expect(isValidIdempotencyKey("order #1")).toBe(false); // spasi
    expect(isValidIdempotencyKey("order/1")).toBe(false); // slash
  });

  it("hashBody deterministik & sensitif terhadap perubahan", async () => {
    const a = new TextEncoder().encode('{"to":"62812"}');
    const b = new TextEncoder().encode('{"to":"62813"}');
    const h1 = await hashBody(a);
    expect(h1).toBe(await hashBody(a));
    expect(h1).not.toBe(await hashBody(b));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
