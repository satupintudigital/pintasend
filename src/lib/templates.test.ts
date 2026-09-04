import { describe, expect, it, vi, beforeEach } from "vitest";
import { NALA_TEMPLATES, seedTemplatesForSession } from "./templates";
import type { OpenwaTemplate } from "./templates";

const listTemplatesMock = vi.fn();
const createTemplateMock = vi.fn();

vi.mock("@/lib/openwa", () => ({
  openwa: {
    listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
    createTemplate: (...args: unknown[]) => createTemplateMock(...args),
  },
  OpenwaError: class OpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  publicOpenwaError: (e: unknown) => String(e),
}));

beforeEach(() => {
  listTemplatesMock.mockReset();
  createTemplateMock.mockReset();
  listTemplatesMock.mockResolvedValue([]);
  createTemplateMock.mockResolvedValue({ id: "tpl-1", name: "pesanan_baru" });
});

describe("NALA_TEMPLATES", () => {
  it("memuat 7 template standar NalaNiaga dengan nama unik", () => {
    expect(NALA_TEMPLATES).toHaveLength(7);
    const names = NALA_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "pesanan_baru",
        "bukti_transfer_diterima",
        "pembayaran_lunas",
        "pesanan_dikirim",
        "pesanan_dibatalkan",
        "pengingat_keranjang",
        "sapaan_pelanggan",
      ]),
    );
  });

  it("setiap template punya body non-kosong dan nama valid", () => {
    for (const t of NALA_TEMPLATES) {
      expect(t.body.trim().length).toBeGreaterThan(0);
      expect(/^[a-z0-9_]+$/.test(t.name)).toBe(true);
    }
  });
});

describe("seedTemplatesForSession", () => {
  it("membuat semua template saat session belum punya apa pun", async () => {
    await seedTemplatesForSession("sess-1");
    expect(createTemplateMock).toHaveBeenCalledTimes(NALA_TEMPLATES.length);
    expect(createTemplateMock).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ name: "pesanan_baru", body: expect.any(String) }),
    );
  });

  it("melewati template yang sudah ada (skip, tidak create ulang)", async () => {
    listTemplatesMock.mockResolvedValue([
      { id: "t1", name: "pesanan_baru" },
      { id: "t2", name: "sapaan_pelanggan" },
    ] as OpenwaTemplate[]);
    await seedTemplatesForSession("sess-2");
    const createdNames = createTemplateMock.mock.calls.map((c) => (c[1] as { name: string }).name);
    expect(createdNames).not.toContain("pesanan_baru");
    expect(createdNames).not.toContain("sapaan_pelanggan");
    expect(createdNames).toHaveLength(NALA_TEMPLATES.length - 2);
  });

  it("konflik 409 dianggap sudah ada → lanjut, tidak throw", async () => {
    createTemplateMock.mockRejectedValueOnce({ status: 409, message: "already exists" });
    await seedTemplatesForSession("sess-3");
    expect(createTemplateMock).toHaveBeenCalledTimes(NALA_TEMPLATES.length);
  });

  it("error lain dibiarkan melempar (agar caller tahu seeding gagal)", async () => {
    createTemplateMock.mockRejectedValueOnce(new Error("network down"));
    await expect(seedTemplatesForSession("sess-4")).rejects.toThrow("network down");
  });

  it("gagal list template → throw (caller memutuskan best-effort)", async () => {
    listTemplatesMock.mockRejectedValue(new Error("gateway down"));
    await expect(seedTemplatesForSession("sess-5")).rejects.toThrow("gateway down");
  });
});
