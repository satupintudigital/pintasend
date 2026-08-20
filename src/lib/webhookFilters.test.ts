import { describe, expect, it } from "vitest";
import {
  collectFilterErrors,
  evaluateFilters,
  FILTER_FIELDS,
  MESSAGE_TYPES,
  type WebhookFilters,
} from "./webhookFilters";

const msg = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  from: "6281234567890@c.us",
  to: "6289876543210@c.us",
  body: "Halo, pesanan saya sudah sampai?",
  type: "text",
  isGroup: false,
  fromMe: false,
  ...overrides,
});

describe("evaluateFilters — lolos saat tanpa filter", () => {
  it("null / undefined / kondisi kosong → true", () => {
    expect(evaluateFilters(null, "message.received", msg())).toBe(true);
    expect(evaluateFilters(undefined, "message.received", msg())).toBe(true);
    expect(evaluateFilters({ conditions: [] }, "message.received", msg())).toBe(true);
  });

  it("event non-konten selalu lolos walau ada filter", () => {
    const filters: WebhookFilters = {
      conditions: [{ field: "sender", operator: "is", value: "999" }],
    };
    for (const event of ["session.status", "message.ack", "message.failed"]) {
      expect(evaluateFilters(filters, event, msg())).toBe(true);
    }
  });
});

describe("evaluateFilters — sender / recipient (normalisasi id)", () => {
  it("bare digits dinormalisasi ke @c.us", () => {
    const filters: WebhookFilters = {
      conditions: [{ field: "sender", operator: "is", value: ["6281234567890"] }],
    };
    expect(evaluateFilters(filters, "message.received", msg())).toBe(true);
  });

  it("isNot → kebalikan", () => {
    const filters: WebhookFilters = {
      conditions: [{ field: "sender", operator: "isNot", value: ["6281234567890"] }],
    };
    expect(evaluateFilters(filters, "message.received", msg())).toBe(false);
  });

  it("author (grup) diutamakan dari from", () => {
    const data = msg({ author: "6281111111111@c.us" });
    const hit: WebhookFilters = {
      conditions: [{ field: "sender", operator: "is", value: ["6281111111111"] }],
    };
    const miss: WebhookFilters = {
      conditions: [{ field: "sender", operator: "is", value: ["6281234567890"] }],
    };
    expect(evaluateFilters(hit, "message.received", data)).toBe(true);
    expect(evaluateFilters(miss, "message.received", data)).toBe(false);
  });
});

describe("evaluateFilters — body", () => {
  it("contains case-insensitive (default)", () => {
    const filters: WebhookFilters = {
      conditions: [{ field: "body", operator: "contains", value: "PESANAN" }],
    };
    expect(evaluateFilters(filters, "message.received", msg())).toBe(true);
  });

  it("caseSensitive membedakan huruf besar/kecil", () => {
    const filters: WebhookFilters = {
      conditions: [{ field: "body", operator: "contains", value: "PESANAN", caseSensitive: true }],
    };
    expect(evaluateFilters(filters, "message.received", msg())).toBe(false);
  });

  it("equals butuh kecocokan penuh", () => {
    const exact: WebhookFilters = {
      conditions: [{ field: "body", operator: "equals", value: "Halo, pesanan saya sudah sampai?" }],
    };
    const partial: WebhookFilters = {
      conditions: [{ field: "body", operator: "equals", value: "pesanan" }],
    };
    expect(evaluateFilters(exact, "message.received", msg())).toBe(true);
    expect(evaluateFilters(partial, "message.received", msg())).toBe(false);
  });
});

describe("evaluateFilters — type & boolean", () => {
  it("type is / isNot", () => {
    expect(
      evaluateFilters(
        { conditions: [{ field: "type", operator: "is", value: ["text"] }] },
        "message.received",
        msg(),
      ),
    ).toBe(true);
    expect(
      evaluateFilters(
        { conditions: [{ field: "type", operator: "isNot", value: ["image"] }] },
        "message.received",
        msg(),
      ),
    ).toBe(true);
  });

  it("isGroup / fromMe / hasMedia", () => {
    const group = msg({ isGroup: true, from: "120363…@g.us", author: "6281234567890@c.us" });
    expect(
      evaluateFilters(
        { conditions: [{ field: "isGroup", operator: "is", value: true }] },
        "message.received",
        group,
      ),
    ).toBe(true);
    expect(
      evaluateFilters(
        { conditions: [{ field: "hasMedia", operator: "is", value: true }] },
        "message.received",
        msg({ media: { mimetype: "image/jpeg" } }),
      ),
    ).toBe(true);
    expect(
      evaluateFilters(
        { conditions: [{ field: "hasMedia", operator: "is", value: false }] },
        "message.received",
        msg(),
      ),
    ).toBe(true);
  });
});

describe("evaluateFilters — kombinasi & field tak dikenal", () => {
  it("semua kondisi AND", () => {
    const filters: WebhookFilters = {
      conditions: [
        { field: "sender", operator: "is", value: ["6281234567890"] },
        { field: "body", operator: "contains", value: "pesanan" },
        { field: "type", operator: "is", value: ["text"] },
      ],
    };
    expect(evaluateFilters(filters, "message.received", msg())).toBe(true);
    expect(
      evaluateFilters(
        { conditions: [{ field: "sender", operator: "is", value: ["6281234567890"] }, { field: "body", operator: "contains", value: "zzz" }] },
        "message.received",
        msg(),
      ),
    ).toBe(false);
  });

  it("field tidak dikenal di-skip (forward-compatible)", () => {
    const filters: WebhookFilters = {
      conditions: [{ field: "futureField", operator: "is", value: "x" }],
    };
    expect(evaluateFilters(filters, "message.received", msg())).toBe(true);
  });
});

describe("collectFilterErrors — validasi", () => {
  it("objek kosong / null → tanpa error", () => {
    expect(collectFilterErrors(null)).toEqual([]);
    expect(collectFilterErrors(undefined)).toEqual([]);
    expect(collectFilterErrors({ conditions: [] })).toEqual([]);
  });

  it("bukan objek / conditions bukan array → error", () => {
    expect(collectFilterErrors("x").length).toBeGreaterThan(0);
    expect(collectFilterErrors({ conditions: "nope" }).length).toBeGreaterThan(0);
  });

  it("field tidak dikenal → error dengan daftar pilihan", () => {
    const errors = collectFilterErrors({ conditions: [{ field: "warna", operator: "is", value: ["x"] }] });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("tidak dikenal");
    expect(errors[0]).toContain(FILTER_FIELDS[0].field);
  });

  it("operator tidak diizinkan untuk field → error", () => {
    const errors = collectFilterErrors({
      conditions: [{ field: "body", operator: "is", value: "x" }],
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("tidak diizinkan");
  });

  it("boolean harus bernilai boolean", () => {
    const errors = collectFilterErrors({
      conditions: [{ field: "isGroup", operator: "is", value: "true" }],
    });
    expect(errors.length).toBe(1);
  });

  it("enum value di luar daftar → error", () => {
    const errors = collectFilterErrors({
      conditions: [{ field: "type", operator: "is", value: ["nope"] }],
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("bukan tipe valid");
  });

  it("id/enum value harus array non-kosong", () => {
    expect(
      collectFilterErrors({ conditions: [{ field: "sender", operator: "is", value: "62812" }] }).length,
    ).toBeGreaterThan(0);
    expect(
      collectFilterErrors({ conditions: [{ field: "sender", operator: "is", value: [] }] }).length,
    ).toBeGreaterThan(0);
  });

  it("kondisi valid lengkap → tanpa error", () => {
    const errors = collectFilterErrors({
      conditions: [
        { field: "sender", operator: "is", value: ["62812"] },
        { field: "body", operator: "contains", value: "halo", caseSensitive: true },
        { field: "type", operator: "is", value: ["text", "image"] },
        { field: "isGroup", operator: "is", value: true },
      ],
    });
    expect(errors).toEqual([]);
  });

  it("batas maksimal kondisi ditegakkan", () => {
    const conditions = Array.from({ length: 21 }, () => ({
      field: "body",
      operator: "contains",
      value: "x",
    }));
    expect(collectFilterErrors({ conditions }).length).toBeGreaterThan(0);
  });
});

describe("registry", () => {
  it("semua field punya operator & MESSAGE_TYPES lengkap", () => {
    expect(FILTER_FIELDS.map((f) => f.field)).toEqual([
      "sender",
      "recipient",
      "body",
      "type",
      "isGroup",
      "fromMe",
      "hasMedia",
    ]);
    expect(MESSAGE_TYPES).toContain("text");
    expect(MESSAGE_TYPES).toContain("sticker");
  });
});
