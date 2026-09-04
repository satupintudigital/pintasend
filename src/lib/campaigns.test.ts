import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderCampaignTemplate, extractTemplateVars } from "./campaigns";

describe("renderCampaignTemplate — substitusi {{var}}", () => {
  it("substitusi variabel bawaan", () => {
    expect(renderCampaignTemplate("Hai {{nama}}!", { nama: "Budi" })).toBe("Hai Budi!");
  });

  it("beberapa token sekaligus", () => {
    expect(
      renderCampaignTemplate("{{nama}} ({{nomor}}) — {{tanggal}}", {
        nama: "Sari",
        nomor: "6281234567890",
        tanggal: "21/08/2026",
      }),
    ).toBe("Sari (6281234567890) — 21/08/2026");
  });

  it("token tanpa nilai dibiarkan apa adanya", () => {
    expect(renderCampaignTemplate("Hai {{nama}} {{kodeVoucher}}", { nama: "Budi" })).toBe(
      "Hai Budi {{kodeVoucher}}",
    );
  });

  it("whitespace dalam kurung diizinkan", () => {
    expect(renderCampaignTemplate("Hai {{ nama }}", { nama: "Budi" })).toBe("Hai Budi");
  });

  it("tanpa variabel → body apa adanya", () => {
    expect(renderCampaignTemplate("Promo spesial hari ini!")).toBe("Promo spesial hari ini!");
  });
});

describe("extractTemplateVars — daftar token unik", () => {
  it("urut sesuai kemunculan, duplikat di-skip", () => {
    expect(extractTemplateVars("{{nama}} beli {{produk}}, {{nama}} dapat poin")).toEqual([
      "nama",
      "produk",
    ]);
  });

  it("token dengan spasi tetap terdeteksi", () => {
    expect(extractTemplateVars("Hai {{ nama }}")).toEqual(["nama"]);
  });

  it("tanpa token → array kosong", () => {
    expect(extractTemplateVars("Tanpa variabel")).toEqual([]);
  });
});

// Guard import berat (db/tenantConfig) tidak boleh dieksekusi saat test murni.
beforeEach(() => {
  vi.restoreAllMocks();
});
