import { describe, it, expect } from "vitest";
import { uuidv7, uuidv7Timestamp } from "./uuidv7";

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("menghasilkan string dengan format UUID v7 yang valid", () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_V7_RE);
    // version nibble = 7, variant (RFC 4122 `10xx`) = 8|9|a|b
    expect(id[14]).toBe("7");
    expect(id[19]).toMatch(/[89ab]/);
  });

  it("unik untuk banyak pemanggilan", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) seen.add(uuidv7());
    expect(seen.size).toBe(10000);
  });

  it("membawa timestamp saat dibuat (via uuidv7Timestamp)", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const t = uuidv7Timestamp(id).getTime();
    expect(t).toBeGreaterThanOrEqual(before - 5);
    expect(t).toBeLessThanOrEqual(after + 5);
  });

  it("uuidv7Timestamp mengembalikan epoch 0 untuk UUID non-v7", () => {
    // UUID v4 (random) bukan v7
    expect(uuidv7Timestamp("f47ac10b-58cc-4372-a567-0e02b2c3d479").getTime()).toBe(0);
    expect(uuidv7Timestamp("bukan-uuid").getTime()).toBe(0);
  });

  it("terurut secara leksikografis sesuai waktu pembuatan (kasar)", () => {
    const early = uuidv7();
    const late = uuidv7();
    // versi & variant sama, random tail bisa membuat tak terurut persis;
    // tapi timestamp prefix harus terurut (atau sama) — bandingkan 12 hex pertama
    const earlyTs = early.replace(/-/g, "").slice(0, 12);
    const lateTs = late.replace(/-/g, "").slice(0, 12);
    expect(parseInt(lateTs, 16)).toBeGreaterThanOrEqual(parseInt(earlyTs, 16));
  });
});
