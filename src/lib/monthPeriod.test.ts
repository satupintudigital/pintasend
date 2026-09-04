import { describe, it, expect } from "vitest";
import {
  currentMonthStartIso,
  isValidPeriod,
  monthPeriodRange,
  monthStartIso,
} from "./monthPeriod";

describe("monthPeriod (bulan kalender WIB)", () => {
  it("monthStartIso membentuk awal bulan WIB", () => {
    expect(monthStartIso(2026, 9)).toBe("2026-09-01T00:00:00+07:00");
    expect(monthStartIso(2026, 12)).toBe("2026-12-01T00:00:00+07:00");
  });

  it("monthPeriodRange: September 2026 = 1..30 WIB (exclusive end bulan berikutnya)", () => {
    const { periodStart, periodEnd } = monthPeriodRange(2026, 9);
    // 2026-09-01 00:00 WIB == 2026-08-31 17:00 UTC
    expect(periodStart.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    // 2026-10-01 00:00 WIB == 2026-09-30 17:00 UTC
    expect(periodEnd.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("currentMonthStartIso konsisten format WIB", () => {
    const iso = currentMonthStartIso(new Date("2026-09-04T00:00:00Z"));
    expect(iso).toBe("2026-09-01T00:00:00+07:00");
  });

  it("isValidPeriod menolak bulan/tahun di luar jangkauan", () => {
    expect(isValidPeriod(2026, 9)).toBe(true);
    expect(isValidPeriod(2026, 0)).toBe(false);
    expect(isValidPeriod(2026, 13)).toBe(false);
    expect(isValidPeriod(2019, 9)).toBe(false);
    expect(isValidPeriod(2101, 9)).toBe(false);
  });
});
