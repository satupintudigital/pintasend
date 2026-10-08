import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  appendFootnote,
  DEFAULT_WATERMARK_FOOTNOTE,
  getWatermarkFootnote,
  invalidateWatermarkFootnoteCache,
  resolveWatermark,
  resolveWatermarkFootnote,
  tenantHasRemoveWatermark,
  WATERMARK_ADDON_KEY,
} from "./watermark";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { query } from "./db";

afterEach(() => {
  delete process.env.PINTSEND_WATERMARK_FOOTNOTE;
  invalidateWatermarkFootnoteCache();
  vi.restoreAllMocks();
});

beforeEach(() => vi.clearAllMocks());

describe("getWatermarkFootnote", () => {
  it("env tidak diset → default bawaan", () => {
    expect(getWatermarkFootnote({})).toBe(DEFAULT_WATERMARK_FOOTNOTE);
  });

  it("env diset → dipakai (trimmed)", () => {
    expect(getWatermarkFootnote({ PINTSEND_WATERMARK_FOOTNOTE: "  Iklan kami  " })).toBe("Iklan kami");
  });

  it("env kosong/whitespace → default", () => {
    expect(getWatermarkFootnote({ PINTSEND_WATERMARK_FOOTNOTE: "   " })).toBe(DEFAULT_WATERMARK_FOOTNOTE);
  });
});

describe("appendFootnote", () => {
  const foot = "Dikirim via PintaSend · pintasend.satupintudigital.co.id";

  it("footnote kosong → teks apa adanya", () => {
    expect(appendFootnote("Halo", "", 100)).toBe("Halo");
    expect(appendFootnote("Halo", "   ", 100)).toBe("Halo");
  });

  it("teks pendek → teks + pemisah + footnote", () => {
    expect(appendFootnote("Halo", foot, 200)).toBe(`Halo\n\n${foot}`);
  });

  it("gabungan melebihi max → teks utama dipangkas, footnote utuh", () => {
    // max = 50 + foot.length; keep = max - separator - footnote = 48
    const keep = 48;
    const maxLength = 50 + foot.length;
    const out = appendFootnote("x".repeat(100), foot, maxLength);
    expect(out).toBe("x".repeat(keep) + `\n\n${foot}`);
    expect(out.length).toBe(maxLength);
    expect(out.endsWith(foot)).toBe(true);
  });

  it("teks habis dipangkas → footnote saja (dipangkas ke max)", () => {
    const out = appendFootnote("", foot, 10);
    expect(out.length).toBe(10);
    expect(foot.startsWith(out)).toBe(true);
  });

  it("footnote lebih panjang dari max → footnote dipangkas", () => {
    const out = appendFootnote("Halo", foot, 6);
    expect(out.length).toBe(6);
  });
});

describe("tenantHasRemoveWatermark", () => {
  it("addon aktif → true", async () => {
    vi.mocked(query).mockResolvedValueOnce([{ active: true }]);
    expect(await tenantHasRemoveWatermark("t1")).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("TenantAddon"),
      ["t1", WATERMARK_ADDON_KEY],
    );
  });

  it("tanpa baris → false", async () => {
    vi.mocked(query).mockResolvedValueOnce([]);
    expect(await tenantHasRemoveWatermark("t1")).toBe(false);
  });

  it("query menyertakan kondisi activeUntil (kedaluwarsa diperhitungkan)", async () => {
    vi.mocked(query).mockResolvedValueOnce([{ active: true }]);
    await tenantHasRemoveWatermark("t1");
    const sql = vi.mocked(query).mock.calls[0][0] as string;
    expect(sql).toContain('"activeUntil" IS NULL OR "activeUntil" > now()');
  });
});

describe("resolveWatermarkFootnote", () => {
  it("env override menang tanpa sentuh DB", async () => {
    process.env.PINTSEND_WATERMARK_FOOTNOTE = "Iklan env";
    const foot = await resolveWatermarkFootnote();
    expect(foot).toBe("Iklan env");
    expect(query).not.toHaveBeenCalled();
  });

  it("env kosong → setting DB dipakai (PlatformSetting watermark_footnote)", async () => {
    process.env.PINTSEND_WATERMARK_FOOTNOTE = "   ";
    vi.mocked(query).mockResolvedValueOnce([{ value: JSON.stringify("Iklan dari setting") }]);
    const foot = await resolveWatermarkFootnote();
    expect(foot).toBe("Iklan dari setting");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("PlatformSetting"), [
      "watermark_footnote",
    ]);
  });

  it("tidak ada baris setting → fallback default", async () => {
    vi.mocked(query).mockResolvedValueOnce([]);
    const foot = await resolveWatermarkFootnote();
    expect(foot).toBe(DEFAULT_WATERMARK_FOOTNOTE);
  });

  it("DB error → fallback default (never-throw)", async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error("db down"));
    const foot = await resolveWatermarkFootnote();
    expect(foot).toBe(DEFAULT_WATERMARK_FOOTNOTE);
  });
});

describe("resolveWatermark", () => {
  it("tenant TANPA addon → footnote diterapkan (env override)", async () => {
    process.env.PINTSEND_WATERMARK_FOOTNOTE = "Iklan";
    vi.mocked(query).mockResolvedValueOnce([]);
    const d = await resolveWatermark("t1");
    expect(d).toEqual({ apply: true, footnote: "Iklan" });
  });

  it("tenant DENGAN addon aktif → footnote dilewati", async () => {
    process.env.PINTSEND_WATERMARK_FOOTNOTE = "Iklan";
    vi.mocked(query).mockResolvedValueOnce([{ active: true }]);
    const d = await resolveWatermark("t1");
    expect(d).toEqual({ apply: false, footnote: "Iklan" });
  });

  it("env kosong + no setting → default diterapkan (addon query tetap jalan)", async () => {
    process.env.PINTSEND_WATERMARK_FOOTNOTE = "   ";
    vi.mocked(query)
      .mockResolvedValueOnce([]) // setting → default
      .mockResolvedValueOnce([]); // addon → tidak aktif
    const d = await resolveWatermark("t1");
    expect(d).toEqual({ apply: true, footnote: DEFAULT_WATERMARK_FOOTNOTE });
  });
});
