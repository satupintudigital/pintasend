import { describe, expect, it, vi, afterEach } from "vitest";
import { OpenwaError, publicOpenwaError } from "./openwa";

// Helper pembocor detail: pesan publik harus GENERIK, detail hanya di log.
// (openwa.ts memakai import relatif "./apiKeys" — aman di vitest.)

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publicOpenwaError — mask detail internal dari respons publik", () => {
  it("OpenwaError → pesan generik (tanpa detail message/status)", () => {
    const e = new OpenwaError(502, "Connection refused: 10.0.0.5:2785 session abc-123");
    const msg = publicOpenwaError(e, "test-context");

    expect(msg).not.toContain("10.0.0.5");
    expect(msg).not.toContain("abc-123");
    expect(msg).not.toContain("502");
    expect(msg).toMatch(/gateway|Gagal/i);
  });

  it("error non-Openwa → pesan generik juga", () => {
    const msg = publicOpenwaError(new Error("secrets internal"), "test-context");
    expect(msg).not.toContain("secrets");
    expect(msg).toMatch(/gateway|Gagal/i);
  });

  it("detail lengkap dicatat ke console.error (utk debugging internal)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new OpenwaError(500, "detail rahasia server");

    publicOpenwaError(e, "kirim-pesan");

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]);
    expect(logged).toContain("kirim-pesan");
    expect(logged).toContain("detail rahasia server");
    expect(logged).toContain("500");
  });

  it("status OpenwaError tetap bisa dibaca pemanggil (utk logika 404 vs 502)", () => {
    const e = new OpenwaError(404, "session not found");
    expect(e.status).toBe(404);
    const msg = publicOpenwaError(e, "test");
    expect(msg).not.toContain("404");
  });
});
