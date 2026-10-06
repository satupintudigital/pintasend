import { describe, expect, it } from "vitest";
import {
  renderRadiologyReadyMessage,
  validateRadiologyReadyPayload,
} from "./imagestro";

const valid = {
  to: "6281234567890",
  study_uid: "1.3.6.1.4.1.99999.1.2.3.4.5",
  link: "https://portal.contoh.id/studies/1.3.6.1.4.1.99999.1.2.3.4.5",
  patient_name: "Budi Santoso",
  modality: "CT",
};

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

describe("renderRadiologyReadyMessage", () => {
  it("dengan modality + nama pasien", () => {
    expect(renderRadiologyReadyMessage(valid)).toBe(
      "Hasil pemeriksaan radiologi CT atas nama Budi Santoso sudah tersedia.\n" +
        `Lihat hasilnya melalui aplikasi Satusehat Atua: ${valid.link}`,
    );
  });

  it("tanpa modality & nama → kalimat dipangkas", () => {
    expect(
      renderRadiologyReadyMessage({
        to: "62812",
        study_uid: "1.2.3",
        link: "https://x.id/s/1",
      }),
    ).toBe(
      "Hasil pemeriksaan radiologi sudah tersedia.\n" +
        "Lihat hasilnya melalui aplikasi Satusehat Atua: https://x.id/s/1",
    );
  });

  it("modality saja", () => {
    expect(
      renderRadiologyReadyMessage({
        to: "62812",
        study_uid: "1.2.3",
        link: "https://x.id/s/1",
        modality: "USG",
      }),
    ).toContain("Hasil pemeriksaan radiologi USG sudah tersedia.");
  });
});
