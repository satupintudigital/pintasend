# Integrasi Imagestro → PintaSend: Notifikasi Hasil Radiologi via WhatsApp

Tanggal: 2026-10-06
Status: **disetujui (brainstorming)** — menunggu review spec
Repositori terlibat: `pintasend` (gateway WhatsApp) + `Imagestro-PACS` (PACS/router/order-worker)

## Ringkasan

Saat study DICOM berhasil dikirim ke SATUSEHAT (STOW-RS + ImagingStudy berhasil
dibuat, `dicom_forward_status = success`), pasien menerima notifikasi WhatsApp
bahwa hasil pemeriksaan radiologinya sudah bisa dilihat melalui aplikasi
Satusehat Atua, lengkap dengan link ke portal pasien Imagestro.

Notifikasi dikirim melalui **PintaSend** (gateway WhatsApp OpenWA) — Imagestro
memanggil endpoint khusus PintaSend, PintaSend yang mengirimkan pesan ke nomor
WhatsApp pasien.

## Keputusan desain (hasil clarifying questions)

| Keputusan | Pilihan |
|---|---|
| Channel | WhatsApp via PintaSend (OpenWA) |
| Trigger | DICOM forward ke SATUSEHAT SUCCESS |
| Link | Template URL konfigurasi per deployment (placeholder `{study_uid}`) → portal pasien Imagestro |
| Nomor pasien | Diresolve oleh Imagestro (`studies`→`orders.patient_id` → `MASTER_DATA_WORKER` `GET /patients/{id}` → `phone`) |

## Arsitektur & alur data

```
satusehat-dicom-router (queue consumer)
  │ processForward(): STOW-RS ✓ + ImagingStudy ✓ → markSuccess()
  │ payload sudah mengandung tenant_id, study_uid, order_id, patient_id,
  │   modality, accession_number, study_description, environment, imaging_study_id
  │ fire-and-forget POST /internal/dicom-forward-success
  │   (ORDER_WORKER service binding, header X-Gateway-Secret)
  ▼
order-worker
  │ payload.patient_id → MASTER_DATA_WORKER GET /patients/{id} (X-Tenant-ID)
  │   → patient_name + phone        (kalau patient_id null → skip + record failed)
  │ link = RADIOLOGY_PORTAL_URL_TEMPLATE.replace("{study_uid}", study_uid)
  │ idempotency: INSERT radiology_notifications(study_uid UNIQUE, ON CONFLICT skip)
  │ POST {PINTSEND_BASE_URL}/v1/integrations/imagestro/radiology-ready
  │   Authorization: Bearer {PINTSEND_API_KEY}
  │   Idempotency-Key: imagestro-radiology:{study_uid}
  ▼
pintasend (Cloudflare Workers / OpenNext)
  │ verifyApiKey (tenant-scoped) → validasi zod payload
  │ render pesan Indonesia → executeSendMessage()
  │   (reuse: kuota, gate kredit, device ready, watermark, message log, Idempotency-Key KV)
  ▼
OpenWA → WhatsApp pasien
```

> Catatan: `DicomForwardPayload` sudah mengandung `patient_id`, `order_id`,
> `modality`, `accession_number`, `study_description` — sehingga order-worker
> **tidak** perlu lookup `studies`/`orders`; cukup satu panggilan master-data
> untuk dapatkan nama + phone.

Isi pesan WhatsApp (template v1):

```
Hasil pemeriksaan radiologi {modality} atas nama {patient_name} sudah tersedia.
Lihat hasilnya melalui aplikasi Satusehat Atua: {link}

{footnote watermark platform, jika addon remove_watermark tidak aktif}
```

Aturan rendering: `modality` dan `patient_name` opsional — kalau kosong,
kalimat dipangkas jadi `Hasil pemeriksaan radiologi sudah tersedia.` (tanpa
segmen modality/nama). `link` wajib (validasi 400 kalau kosong/bukan URL).

## Komponen

### pintasend (repo ini)

- **`src/app/v1/integrations/imagestro/radiology-ready/route.ts`** — route baru.
  Auth: `Authorization: Bearer <API key>` via `verifyApiKey` (pola sama dengan
  `src/app/v1/messages/route.ts`). Response shape mengikuti `executeSendMessage`
  (`{ ok, deviceId, to, messageId, ... }`).
- **`src/lib/imagestro.ts`** — service layer:
  - `parseRadiologyReadyPayload(body)` — validasi zod: `to` (nomor WhatsApp,
    format 628…/08…), `study_uid` (string, wajib), `patient_name?`,
    `modality?`, `accession_number?`, `link` (URL, wajib).
  - `renderRadiologyReadyMessage(data)` — template pesan Indonesia di atas.
  - `executeRadiologyReadyNotification(req, ctx)` — bangun synthetic Request
    (`{ to, text }`) + `Idempotency-Key: imagestro-radiology:{study_uid}`,
    delegasi ke `executeSendMessage`.
- **Unit test** — `src/lib/imagestro.test.ts` + `route.test.ts` (pola vitest
  yang sudah ada: mock `verifyApiKey`, `executeSendMessage`).

### Imagestro-PACS

- **`cloudflare/satusehat-dicom-router/src/handlers/process-forward.ts`** —
  setelah `markSuccess(...)`, panggil `notifyOrderWorker(env, payload,
  imagingStudyId)` — fetch tanpa di-await (fire-and-forget) dengan `.catch()`
  yang log error; **tidak** mengagalkan forward yang sudah sukses (jangan
  return `'retry'`).
- **`cloudflare/satusehat-dicom-router/wrangler.jsonc`** — tambah service
  binding `ORDER_WORKER` (service `order-worker`) di semua environment.
- **`cloudflare/order-worker/src/routes/internal/dicom-forward-success.ts`** —
  route internal baru `POST /internal/dicom-forward-success`:
  - verifikasi `X-Gateway-Secret` == `env.GATEWAY_SHARED_SECRET` (pola
    `validateGatewaySecret` di dicom-router);
  - terima payload `DicomForwardPayload`-like `{ tenant_id, study_uid, order_id,
    patient_id?, accession_number?, modality?, study_description?, environment?,
    imaging_study_id? }`;
  - delegasi ke `radiology-notify` service.
- **`cloudflare/order-worker/src/services/radiology-notify.ts`** — service:
  1. kalau `payload.patient_id` kosong → record `failed` (reason `no_patient_id`) + log, return
  2. `env.MASTER_DATA_WORKER.fetch(GET /patients/{patient_id})` header `X-Tenant-ID: tenant_id`
     → parse `name` + `phone`
  3. kalau phone kosong → record `failed` (reason `no_phone`) + log, return
  4. `INSERT INTO radiology_notifications (...) ON CONFLICT (study_uid) DO NOTHING;`
     kalau conflict → sudah notif, skip (idempotency sisi sumber)
  5. link = `env.RADIOLOGY_PORTAL_URL_TEMPLATE.replace("{study_uid}", study_uid)`
  6. `fetch(PINTSEND_BASE_URL + endpoint)` retry 2× (backoff 1s/3s) untuk 5xx/timeout;
     update status record (`sent`/`failed` + `pintasend_message_id` + `last_error`)
- **`cloudflare/order-worker/wrangler.jsonc`** — vars: `PINTSEND_BASE_URL`
  (mis. `https://pintasend.satupintudigital.co.id`),
  `RADIOLOGY_PORTAL_URL_TEMPLATE` (mis.
  `https://portal.atua.id/studies/{study_uid}`); secret: `PINTSEND_API_KEY`.
- **Migrasi SQL** (Neon, order-worker DB) — tabel `radiology_notifications`:
  `id uuid v7 PK, tenant_id, study_uid UNIQUE, order_id, patient_phone, link,
  status ('pending'|'sent'|'failed'), attempts, last_error, pintasend_message_id,
  created_at, updated_at`.

## Error handling

| Titik | Perilaku |
|---|---|
| dicom-router → order-worker | fire-and-forget; error di-catch + console.error. Forward sudah SUCCESS — jangan `retry` antrian. |
| phone pasien kosong | skip + log (warn). Record tetap dibuat dengan status `failed` + alasan `no_phone`. |
| order-worker → pintasend 5xx/timeout | retry 2×; tetap gagal → record `failed` (target reconciler cron fase 2). |
| pintasend 402 (saldo habis) / 429 (kuota) | record `failed` + error detail; terlihat di log/audit. |
| Idempotency | dua lapis: UNIQUE `study_uid` di `radiology_notifications` + `Idempotency-Key` di pintasend (KV idempotency store). Double-event → respons replay, tidak ada WA ganda. |

## Testing

- **pintasend**: unit test `imagestro.ts` (validasi payload: valid, missing fields,
  nomor invalid, link bukan URL; rendering pesan; pembentukan Idempotency-Key)
  dan route test (auth 401, success path, delegasi). Pola: `src/app/v1/messages/route.test.ts`.
- **Imagestro**: unit test `radiology-notify.ts` (link building, mapping payload,
  skip tanpa phone, idempotency ON CONFLICT) dengan DB mock; test internal route
  (secret salah → 401).

## Non-goals (v1)

- Reconciler cron untuk notifikasi yang gagal (fase 2 — tabel
  `radiology_notifications` sudah jadi targetnya).
- Per-tenant mapping pintasend API key (v1: satu konfigurasi global per deployment
  order-worker).
- Notifikasi untuk gagal forward / validasi upload saja.
- Halaman portal pasien baru (link mengarah ke portal yang sudah ada/dikonfigurasi).

## Referensi kode

- PintaSend: `src/app/v1/messages/route.ts` (auth + delegasi), `src/lib/sendMessage.ts`
  (`executeSendMessage`, idempotency, credit gate), `src/lib/authStore.ts`
  (`verifyApiKey`).
- Imagestro: `cloudflare/satusehat-dicom-router/src/handlers/process-forward.ts`
  (`markSuccess`), `cloudflare/order-worker/src/routes/satusehat.ts`
  (`GET /orders/dicom-forward-status` — pola lookup studies/orders),
  `cloudflare/order-worker/src/services/complete-flow.ts` (`ensurePatient` —
  pola panggil MASTER_DATA_WORKER), `cloudflare/notification-worker/src/middleware/auth.ts`
  (pola service-binding trust).
