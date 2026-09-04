import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  appendFootnote,
  DEFAULT_WATERMARK_FOOTNOTE,
  getWatermarkFootnote,
  resolveWatermark,
  tenantHasRemoveWatermark,
  WATERMARK_ADDON_KEY,
} from "./watermark";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { query } from "./db";

afterEach(() => {
  delete process.env.WAVIO_WATERMARK_FOOTNOTE;
  vi.restoreAllMocks();
});

beforeEach(() => vi.clearAllMocks());

describe("getWatermarkFootnote", () => {
  it("env tidak diset → default bawaan", () => {
    expect(getWatermarkFootnote({})).toBe(DEFAULT_WATERMARK_FOOTNOTE);
  });

  it("env diset → dipakai (trimmed)", () => {
    expect(getWatermarkFootnote({ WAVIO_WATERMARK_FOOTNOTE: "  Iklan kami  " })).toBe("Iklan kami");
  });

  it("env kosong/whitespace → default", () => {
    expect(getWatermarkFootnote({ WAVIO_WATERMARK_FOOTNOTE: "   " })).toBe(DEFAULT_WATERMARK_FOOTNOTE);
  });
});

describe("appendFootnote", () => {
  const foot = "Dikirim via Wavio · wavio.satupintudigital.co.id";

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
});

describe("resolveWatermark", () => {
  it("env kosong/whitespace → fallback ke footnote default, tetap diterapkan", async () => {
    process.env.WAVIO_WATERMARK_FOOTNOTE = "   ";
    vi.mocked(query).mockResolvedValueOnce([]);
    const d = await resolveWatermark("t1");
    expect(d).toEqual({ apply: true, footnote: DEFAULT_WATERMARK_FOOTNOTE });
  });

  it("tenant TANPA addon → footnote diterapkan", async () => {
    process.env.WAVIO_WATERMARK_FOOTNOTE = "Iklan";
    vi.mocked(query).mockResolvedValueOnce([]);
    const d = await resolveWatermark("t1");
    expect(d).toEqual({ apply: true, footnote: "Iklan" });
  });

  it("tenant DENGAN addon aktif → footnote dilewati", async () => {
    process.env.WAVIO_WATERMARK_FOOTNOTE = "Iklan";
    vi.mocked(query).mockResolvedValueOnce([{ active: true }]);
    const d = await resolveWatermark("t1");
    expect(d).toEqual({ apply: false, footnote: "Iklan" });
  });
});
