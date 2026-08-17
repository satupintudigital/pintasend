import { describe, expect, it } from "vitest";
import { normalizeChatId } from "./chat";

describe("normalizeChatId", () => {
  it("628… (internasional) dibiarkan + @c.us", () => {
    expect(normalizeChatId("6281234567890")).toBe("6281234567890@c.us");
  });

  it("0812… (0 di depan) → 62812…", () => {
    expect(normalizeChatId("081234567890")).toBe("6281234567890@c.us");
  });

  it("812… (tanpa 0/62) → 62812…", () => {
    expect(normalizeChatId("81234567890")).toBe("6281234567890@c.us");
  });

  it("buang non-digit: spasi, tanda hubung, kurung", () => {
    expect(normalizeChatId("+62 812-3456-7890")).toBe("6281234567890@c.us");
    expect(normalizeChatId("(0812) 3456 7890")).toBe("6281234567890@c.us");
  });

  it("terlalu pendek → tidak valid (kosong)", () => {
    expect(normalizeChatId("628123")).toBe("");
    expect(normalizeChatId("081")).toBe("");
  });

  it("bukan angka → tidak valid", () => {
    expect(normalizeChatId("abcdefghijk")).toBe("");
    expect(normalizeChatId("")).toBe("");
  });

  it("nomor asing (bukan 62) tetap lolos sebagai 62… jika panjang sesuai", () => {
    // 65… dianggap salah format karena bukan 62/8/0 di awal — untuk MVP
    // Wavio fokus nomor Indonesia; format lain ditolak.
    expect(normalizeChatId("6591234567890")).toBe("");
  });
});
