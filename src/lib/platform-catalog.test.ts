import { describe, it, expect } from "vitest";
import { parseAddonCreateBody, parsePlanCreateBody } from "./platform";

// Parser create plan & addon (pure, tanpa DB) — dipakai route platform.
describe("parsePlanCreateBody", () => {
  it("body valid → plan dgn default (prepaid butuh kind eksplisit)", () => {
    const res = parsePlanCreateBody({
      name: "  Americano  ",
      kind: "prepaid",
      priceMonthly: 0,
      maxDevices: 1,
      maxUsers: 2,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.name).toBe("Americano");
    expect(res.plan.kind).toBe("prepaid");
    expect(res.plan.priceDisplay).toBe("Americano"); // default = nama
    expect(res.plan.maxMessagesPerMonth).toBeNull();
    expect(res.plan.isPublic).toBe(true);
    expect(res.plan.sortOrder).toBe(0);
  });

  it("default kind subscription bila dikosongkan", () => {
    const res = parsePlanCreateBody({ name: "Latte Baru" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.kind).toBe("subscription");
  });

  it("menolak nama kosong & kind tak dikenal & angka negatif", () => {
    expect(parsePlanCreateBody({ name: "  " }).ok).toBe(false);
    expect(parsePlanCreateBody({ name: "X", kind: "yearly" }).ok).toBe(false);
    expect(parsePlanCreateBody({ name: "X", kind: "prepaid", maxDevices: -1 }).ok).toBe(false);
    expect(parsePlanCreateBody({ name: "X", kind: "prepaid", priceMonthly: -5 }).ok).toBe(false);
    expect(parsePlanCreateBody({ name: "X", kind: "prepaid", maxMessagesPerMonth: "banyak" }).ok).toBe(false);
  });
});

describe("parseAddonCreateBody", () => {
  it("body valid → addon, key dinormalisasi lowercase", () => {
    const res = parseAddonCreateBody({ key: "  Anti-Spam  ", name: "Anti Spam", priceMonthly: 25000 });
    // key berisi '-' → regex menolak
    expect(res.ok).toBe(false);
  });

  it("key huruf kecil + underscore diterima", () => {
    const res = parseAddonCreateBody({ key: "no_watermark_x", name: "X", priceMonthly: 25000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.addon.key).toBe("no_watermark_x");
    expect(res.addon.priceMonthly).toBe(25000);
    expect(res.addon.isActive).toBe(true);
  });

  it("menolak key kosong/ilegal, nama kosong, harga negatif; harga null diizinkan", () => {
    expect(parseAddonCreateBody({ key: "", name: "X" }).ok).toBe(false);
    expect(parseAddonCreateBody({ key: "a b", name: "X" }).ok).toBe(false);
    expect(parseAddonCreateBody({ key: "ok_key", name: "" }).ok).toBe(false);
    expect(parseAddonCreateBody({ key: "ok_key", name: "X", priceMonthly: -1 }).ok).toBe(false);
    const free = parseAddonCreateBody({ key: "ok_key", name: "X", priceMonthly: null });
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    expect(free.addon.priceMonthly).toBeNull();
  });
});
