import { describe, expect, it } from "vitest";
import {
  getTimeGreeting,
  honorificForGender,
  renderRadiologyReadyMessage,
  validateRadiologyReadyPayload,
} from "./imagestro";

const valid = {
  to: "6281234567890",
  study_uid: "1.3.6.1.4.1.99999.1.2.3.4.5",
  link: "https://portal.contoh.id/studies/1.3.6.1.4.1.99999.1.2.3.4.5",
  patient_name: "Budi Santoso",
  gender: "L",
  procedure_name: "CT Scan Thorax",
  facility_name: "RS Sehat Selalu",
  modality: "CT",
};

// 2026-10-06T04:30:00Z → WIB 11:30 → Siang
const SIANG = new Date("2026-10-06T04:30:00.000Z");

describe("validateRadiologyReadyPayload", () => {
  it("payload lengkap valid", () => {
    const res = validateRadiologyReadyPayload(valid);
    expect(res.ok).toBe(true);
  });

  it("payload minimal (to + study_uid + link) valid", () => {
    const res = validateRadiologyReadyPayload({
      to: "6281234567890",
      study_uid: "1.2.3",
      link: "https://x.id/s/1.2.3",
    });
    expect(res.ok).toBe(true);
  });

  it("field v2 opsional ikut ter-trim", () => {
    const res = validateRadiologyReadyPayload({
      ...valid,
      gender: "  P  ",
      procedure_name: "  USG Abdomen ",
      facility_name: "  Klinik Sehat ",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.gender).toBe("P");
      expect(res.data.procedure_name).toBe("USG Abdomen");
      expect(res.data.facility_name).toBe("Klinik Sehat");
    }
  });

  it('"to" kosong → error', () => {
    const res = validateRadiologyReadyPayload({ ...valid, to: "" });
    expect(res.ok).toBe(false);
  });

  it('"study_uid" kosong → error', () => {
    const res = validateRadiologyReadyPayload({ ...valid, study_uid: "  " });
    expect(res.ok).toBe(false);
  });

  it('"link" bukan URL → error', () => {
    const res = validateRadiologyReadyPayload({ ...valid, link: "bukan-url" });
    expect(res.ok).toBe(false);
  });

  it("body bukan objek → error", () => {
    expect(validateRadiologyReadyPayload(null).ok).toBe(false);
    expect(validateRadiologyReadyPayload("x").ok).toBe(false);
  });
});

describe("getTimeGreeting (WIB)", () => {
  it("07:00 WIB → Pagi", () => {
    expect(getTimeGreeting(new Date("2026-10-06T00:00:00.000Z"))).toBe("Pagi");
  });

  it("10:59 WIB → Pagi", () => {
    expect(getTimeGreeting(new Date("2026-10-06T03:59:00.000Z"))).toBe("Pagi");
  });

  it("11:00 WIB → Siang", () => {
    expect(getTimeGreeting(new Date("2026-10-06T04:00:00.000Z"))).toBe("Siang");
  });

  it("14:59 WIB → Siang", () => {
    expect(getTimeGreeting(new Date("2026-10-06T07:59:00.000Z"))).toBe("Siang");
  });

  it("15:00 WIB → Sore", () => {
    expect(getTimeGreeting(new Date("2026-10-06T08:00:00.000Z"))).toBe("Sore");
  });

  it("17:59 WIB → Sore", () => {
    expect(getTimeGreeting(new Date("2026-10-06T10:59:00.000Z"))).toBe("Sore");
  });

  it("18:00 WIB → Malam", () => {
    expect(getTimeGreeting(new Date("2026-10-06T11:00:00.000Z"))).toBe("Malam");
  });

  it("00:30 WIB (23:59 UTC kemarin) → Pagi", () => {
    expect(getTimeGreeting(new Date("2026-10-05T17:30:00.000Z"))).toBe("Pagi");
  });
});

describe("honorificForGender", () => {
  it("L / male / pria → Bapak", () => {
    for (const g of ["L", "l", "M", "male", "Pria", "laki-laki"]) {
      expect(honorificForGender(g)).toBe("Bapak");
    }
  });

  it("P / female / perempuan → Ibu", () => {
    for (const g of ["P", "p", "F", "female", "Wanita", "perempuan"]) {
      expect(honorificForGender(g)).toBe("Ibu");
    }
  });

  it("tidak dikenali / kosong → Bapak/Ibu", () => {
    expect(honorificForGender(undefined)).toBe("Bapak/Ibu");
    expect(honorificForGender("")).toBe("Bapak/Ibu");
    expect(honorificForGender("X")).toBe("Bapak/Ibu");
  });
});

describe("renderRadiologyReadyMessage (v2)", () => {
  it("lengkap: salam + Bapak + pemeriksaan + faskes", () => {
    expect(renderRadiologyReadyMessage(valid, SIANG)).toBe(
      "Selamat Siang Bapak Budi Santoso,\n" +
        "Hasil pemeriksaan CT Scan Thorax di RS Sehat Selalu sudah tersedia.\n" +
        "Lihat hasilnya melalui aplikasi Satusehat Atua: https://portal.contoh.id/studies/1.3.6.1.4.1.99999.1.2.3.4.5",
    );
  });

  it("gender P → Ibu", () => {
    expect(renderRadiologyReadyMessage({ ...valid, gender: "P" }, SIANG)).toContain(
      "Selamat Siang Ibu Budi Santoso,",
    );
  });

  it("gender tidak diketahui → Bapak/Ibu", () => {
    expect(
      renderRadiologyReadyMessage({ ...valid, gender: undefined }, SIANG),
    ).toContain("Selamat Siang Bapak/Ibu Budi Santoso,");
  });

  it("tanpa nama → salam tanpa sapaan", () => {
    expect(
      renderRadiologyReadyMessage(
        { to: "62812", study_uid: "1.2.3", link: "https://x.id/s/1", procedure_name: "USG" },
        SIANG,
      ),
    ).toContain("Selamat Siang,\n");
  });

  it("tanpa faskes → segmen 'di …' dihilangkan", () => {
    expect(
      renderRadiologyReadyMessage(
        { ...valid, facility_name: undefined },
        SIANG,
      ),
    ).toContain("Hasil pemeriksaan CT Scan Thorax sudah tersedia.");
  });

  it("procedure fallback: study_description → modality → radiologi", () => {
    expect(
      renderRadiologyReadyMessage(
        { ...valid, procedure_name: undefined, study_description: "CT THORAX" },
        SIANG,
      ),
    ).toContain("Hasil pemeriksaan CT THORAX di RS Sehat Selalu sudah tersedia.");

    expect(
      renderRadiologyReadyMessage(
        { ...valid, procedure_name: undefined, study_description: undefined },
        SIANG,
      ),
    ).toContain("Hasil pemeriksaan CT di RS Sehat Selalu sudah tersedia.");

    expect(
      renderRadiologyReadyMessage(
        { ...valid, procedure_name: undefined, study_description: undefined, modality: undefined },
        SIANG,
      ),
    ).toContain("Hasil pemeriksaan radiologi di RS Sehat Selalu sudah tersedia.");
  });

  it("salam mengikuti jam (Pagi)", () => {
    expect(
      renderRadiologyReadyMessage(valid, new Date("2026-10-06T00:30:00.000Z")),
    ).toContain("Selamat Pagi Bapak Budi Santoso,");
  });

  it("link selalu ada di baris terakhir", () => {
    const msg = renderRadiologyReadyMessage({ to: "62812", study_uid: "1.2.3", link: "https://x.id/s/1" }, SIANG);
    expect(msg.endsWith("Lihat hasilnya melalui aplikasi Satusehat Atua: https://x.id/s/1")).toBe(true);
  });
});
