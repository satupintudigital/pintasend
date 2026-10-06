// Service integrasi Imagestro — notifikasi hasil radiologi via WhatsApp.
// Route THIN memanggil executeRadiologyReadyNotification; logika kirim ada di
// src/lib/sendMessage.ts (kuota, kredit, device, watermark, log, idempotensi).
import {
  executeSendMessage,
  type SendMessageContext,
  type SendMessageResult,
} from "./sendMessage";

export interface RadiologyReadyPayload {
  to: string;
  study_uid: string;
  link: string;
  patient_name?: string;
  modality?: string;
  accession_number?: string;
  study_description?: string;
}

type ValidateResult =
  | { ok: true; data: RadiologyReadyPayload }
  | { ok: false; error: string };

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Validasi payload dari Imagestro (tanpa zod — tanpa dependency baru). */
export function validateRadiologyReadyPayload(body: unknown): ValidateResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body JSON harus berupa objek" };
  }
  const b = body as Record<string, unknown>;
  const to = str(b.to);
  const studyUid = str(b.study_uid);
  const link = str(b.link);
  if (!to) return { ok: false, error: 'Field "to" (nomor WhatsApp) wajib diisi' };
  if (!studyUid) return { ok: false, error: 'Field "study_uid" wajib diisi' };
  if (studyUid.length > 128) {
    return { ok: false, error: 'Field "study_uid" maksimal 128 karakter' };
  }
  if (!link) return { ok: false, error: 'Field "link" wajib diisi' };
  if (!isValidHttpUrl(link)) {
    return { ok: false, error: 'Field "link" harus berupa URL http(s) yang valid' };
  }
  return {
    ok: true,
    data: {
      to,
      study_uid: studyUid,
      link,
      patient_name: str(b.patient_name) || undefined,
      modality: str(b.modality) || undefined,
      accession_number: str(b.accession_number) || undefined,
      study_description: str(b.study_description) || undefined,
    },
  };
}

/** Template pesan v1 — segmen modality/nama dihilangkan bila kosong. */
export function renderRadiologyReadyMessage(d: RadiologyReadyPayload): string {
  const parts: string[] = [];
  if (d.modality) parts.push(d.modality);
  if (d.patient_name) parts.push(`atas nama ${d.patient_name}`);
  const middle = parts.length > 0 ? ` ${parts.join(" ")}` : "";
  return [
    `Hasil pemeriksaan radiologi${middle} sudah tersedia.`,
    `Lihat hasilnya melalui aplikasi Satusehat Atua: ${d.link}`,
  ].join("\n");
}

/**
 * Orkestrasi: validasi → render → kirim lewat pipeline /v1/messages.
 * Idempotency-Key = `imagestro-<study_uid>` → event ganda dari Imagestro
 * menghasilkan respons replay, bukan WhatsApp ganda.
 */
export async function executeRadiologyReadyNotification(
  body: unknown,
  ctx: SendMessageContext,
): Promise<SendMessageResult> {
  const parsed = validateRadiologyReadyPayload(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const data = parsed.data;
  const sendReq = new Request("https://internal/v1/integrations/imagestro/radiology-ready", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `imagestro-${data.study_uid}`,
    },
    body: JSON.stringify({ to: data.to, text: renderRadiologyReadyMessage(data) }),
  });

  return executeSendMessage(sendReq, ctx);
}
