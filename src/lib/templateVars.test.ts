import { describe, expect, it } from "vitest";
import {
  extractPlaceholders,
  placeholdersFromTemplate,
  isPlaceholderToken,
} from "./templateVars";

describe("extractPlaceholders", () => {
  it("menemukan placeholder {nama} unik sesuai urutan kemunculan", () => {
    expect(
      extractPlaceholders("Halo {recipientName}, pesanan #{orderNumber} senilai {total}"),
    ).toEqual(["recipientName", "orderNumber", "total"]);
  });

  it("tidak duplikat placeholder yang muncul berulang", () => {
    expect(extractPlaceholders("Halo {nama}, lagi {nama} dan {nama}")).toEqual(["nama"]);
  });

  it("mengabaikan placeholder kosong / berisi karakter aneh", () => {
    expect(extractPlaceholders("a {} b {spasi di sini} c {123} d")).toEqual(["123"]);
  });

  it("mengembalikan [] saat tidak ada placeholder", () => {
    expect(extractPlaceholders("Tidak ada variabel di sini")).toEqual([]);
  });

  it("mengembalikan [] untuk teks kosong", () => {
    expect(extractPlaceholders("")).toEqual([]);
  });
});

describe("placeholdersFromTemplate", () => {
  it("menggabungkan header + body + footer", () => {
    const tpl = {
      name: "pesanan_baru",
      header: "🛍️ PESANAN {jenis}",
      body: "Halo {recipientName}, pesanan #{orderNumber}",
      footer: "Terima kasih {recipientName}",
    };
    expect(placeholdersFromTemplate(tpl)).toEqual(["jenis", "recipientName", "orderNumber"]);
  });

  it("header/footer opsional (null/undefined) — hanya body", () => {
    expect(
      placeholdersFromTemplate({
        name: "x",
        header: null,
        body: "Halo {nama}",
        footer: undefined,
      }),
    ).toEqual(["nama"]);
  });
});

describe("isPlaceholderToken", () => {
  it("valid: huruf, angka, underscore", () => {
    expect(isPlaceholderToken("recipientName")).toBe(true);
    expect(isPlaceholderToken("orderNumber")).toBe(true);
    expect(isPlaceholderToken("total_1")).toBe(true);
  });

  it("invalid: kosong, spasi, karakter khusus", () => {
    expect(isPlaceholderToken("")).toBe(false);
    expect(isPlaceholderToken("nama lengkap")).toBe(false);
    expect(isPlaceholderToken("nama-nama")).toBe(false);
    expect(isPlaceholderToken("nama.nama")).toBe(false);
  });
});
