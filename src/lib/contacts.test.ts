import { describe, expect, it } from "vitest";
import { splitCsvLine, parseContactsCsv } from "./contacts";

describe("splitCsvLine — RFC4180 ringkas", () => {
  it("baris sederhana", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("koma di dalam kutip tidak memecah sel", () => {
    expect(splitCsvLine('"Budi, S.H",0812,x')).toEqual(["Budi, S.H", "0812", "x"]);
  });

  it('escape "" di dalam kutip', () => {
    expect(splitCsvLine('"dia bilang ""hai""",b')).toEqual(['dia bilang "hai"', "b"]);
  });

  it("trim spasi di luar kutip", () => {
    expect(splitCsvLine("  a , b ")).toEqual(["a", "b"]);
  });
});

describe("parseContactsCsv — header fleksibel + normalisasi nomor", () => {
  const csv = [
    "nama,nomor,tags",
    "Budi Santoso,081234567890,vip;pelanggan",
    "Sari,628987654321,prospek",
    ",81123456789,",
    "Grup,1203630123456789@g.us,", // JID grup → dilewati
    "Tidak Valid,abc,",
  ].join("\n");

  it("parse baris valid, lewati nomor rusak & grup", () => {
    const res = parseContactsCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(3);
    expect(res.skipped).toBe(2);
    expect(res.rows[0]).toEqual({
      chatId: "6281234567890@c.us",
      name: "Budi Santoso",
      tags: ["vip", "pelanggan"],
    });
    expect(res.rows[1].chatId).toBe("628987654321@c.us");
    expect(res.rows[2]).toEqual({ chatId: "6281123456789@c.us", name: null, tags: [] });
  });

  it("alias kolom phone/name/tag dikenali", () => {
    const res = parseContactsCsv("phone,name,tag\n081234567890,Budi,vip");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].chatId).toBe("6281234567890@c.us");
  });

  it("header tanpa kolom nomor → error jelas", () => {
    const res = parseContactsCsv("nama,email\nBudi,b@x.com");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("nomor");
  });

  it("file kosong / hanya header → error", () => {
    expect(parseContactsCsv("nama,nomor").ok).toBe(false);
    expect(parseContactsCsv("").ok).toBe(false);
  });

  it("semua baris tidak valid → error", () => {
    const res = parseContactsCsv("nama,nomor\nA,xyz");
    expect(res.ok).toBe(false);
  });

  it("BOM UTF-8 di header ditangani", () => {
    const res = parseContactsCsv("\uFEFFnomor,nama\n081234567890,Budi");
    expect(res.ok).toBe(true);
  });
});
