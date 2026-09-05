# Helper HTTP JSON terpusat (app & worker)

Semua request HTTP keluar yang memakai body JSON / query JSON **harus** lewat
helper terpusat berikut — jangan `fetch()` manual dengan `JSON.stringify` /
string query buatan tangan di call site.

> **Kenapa?** Regresi bug produksi (Sep 2026): route `POST /api/auth/register`
> mengirim token Turnstile sebagai **raw string** ke siteverify worker yang
> parsing JSON → `request.json()` di receiver gagal → captcha **selalu ditolak**
> (registrasi publik tidak mungkin lolos). Root cause: body & header dikonstruksi
> manual di call site. Kontrak kini dikunci di satu tempat agar pola itu tidak
> bisa terjadi lagi.

Ada **dua** implementasi dengan kontrak identik:

| Lokasi | Untuk | Bahasa |
|---|---|---|
| `src/lib/http.ts` | App Wavio (Next.js di Cloudflare Workers) | TypeScript |
| `workers/shared/http.js` | Worker standalone (deploy unit via wrangler) | JavaScript murni |

Worker **tidak bisa** meng-import TS `src/lib` (deploy terpisah), maka helper
di-duplikasi sebagai JS polos. Jaga keduanya **sinkron** — unit test masing-masing
(`src/lib/http.test.ts`, `workers/shared/http.test.js`) mengunci kontrak yang sama.

---

## 1. App — `src/lib/http.ts`

### Fungsi

| Fungsi | Method | Serialisasi |
|---|---|---|
| `postJson(url, body, init?, fetchImpl?)` | selalu `POST` | `JSON.stringify(body)` |
| `jsonFetch(method, url, body, init?, fetchImpl?)` | `POST` / `PUT` / `PATCH` | `JSON.stringify(body)` |
| `getJson(url, { query?, ...init }?, fetchImpl?)` | selalu `GET` | query object → `URLSearchParams` |

Ketiganya **mengembalikan `Response` mentah** — caller yang membaca
(`res.json()`, cek `res.ok`, ekstraksi pesan error, dst.).

### Kontrak yang dijamin (tidak bisa salah lagi)

1. **Body selalu `JSON.stringify`** — nilai apa pun, termasuk string primitif
   (string telanjang dibungkus jadi JSON literal, *tidak pernah* dikirim raw).
2. **`Content-Type: application/json` dipaksa** — header custom tidak bisa menimpanya.
3. **Query object diserialisasi terpusat** via `URLSearchParams`:
   - `null`/`undefined` di-skip,
   - boolean/number di-`String()`-kan,
   - nilai array diulang per elemen (`?id=a&id=b`),
   - URL yang sudah memuat `?` digabung dengan `&`.
4. `fetchImpl` bisa di-inject untuk unit test (default = `fetch` global).

### Contoh pemakaian

```ts
// POST — body objek biasa, tanpa JSON.stringify manual:
const res = await postJson(`${OPENWA}/api/sessions/${id}/messages/send-text`, {
  chatId,
  text,
}, { headers: { "X-API-Key": apiKey } });

// PUT/PATCH — body objek, method ditentukan:
const res = await jsonFetch("PATCH", url, { autoRejectCalls: true });

// GET dengan query terstruktur (bukan string manual):
const res = await getJson(`${OPENWA}/api/sessions/${id}/messages`, {
  query: { chatId, limit, offset, after },
  headers: { "X-API-Key": apiKey },
});
```

### JANGAN pakai helper ini untuk

| Kasus | Alasan | Contoh |
|---|---|---|
| Endpoint ber-**HMAC atas raw body** | signature dihitung dari string body **persis**; helper akan men-serialize ulang → signature selalu gagal | `src/lib/webhookDelivery.ts` (outbox webhook), `src/lib/nalaniagaSso.ts` (`deliverConnectCallback`) |
| Request **bukan JSON** (FormData, multipart) | kontrak helper = JSON | worker `turnstile-siteverify` (siteverify API form-encoded) |
| **Download media mentah** (streaming Response) | bukan panggilan JSON | `openwa.getMedia` / `getProfilePicture` (raw `fetch` GET) |

---

## 2. Worker standalone — `workers/shared/http.js`

API & kontrak **identik** dengan `src/lib/http.ts`:

```js
import { postJson, jsonFetch, getJson } from "../shared/http.js";
```

| Worker | Pemakaian |
|---|---|
| `workers/template-sync/worker.js` | `postJson` (create template) + `getJson` (list template) |
| `workers/campaign-dispatch/worker.js` | `postJson` (send-*) + `getJson` (guard sesi) |
| `workers/platform-broadcast/worker.js` | `postJson` (send-text) |

Sengaja **tidak** memakai helper:

- `workers/webhook-delivery/worker.js` — kirim raw envelope string + header
  `x-wavio-signature` (HMAC atas body persis).
- `workers/turnstile-siteverify/worker.js` — POST FormData ke Cloudflare.
- `workers/d1-resync` & `workers/message-retention` — tidak ada HTTP keluar
  (hanya `fetch` handler inbound + DB).

---

## 3. Aturan untuk developer baru (checklist)

Berlaku untuk **HTTP keluar server-side** (client browser → `/api` sendiri di luar
scope — lihat §4):

- [ ] Panggilan keluar berbody JSON → `postJson` / `jsonFetch`, body = **objek terstruktur**.
- [ ] Panggilan keluar GET dengan parameter → `getJson` + `query: {...}` — jangan menulis
      `?a=${encodeURIComponent(x)}` manual.
- [ ] **Tidak ada** `JSON.stringify(...)` manual di call site (kecuali di dalam modul
      ber-HMAC yang memang butuh raw string, dengan komentar penjelas).
- [ ] Tidak menimpa `Content-Type` sendiri — helper yang memaksa.
- [ ] Header auth (mis. `X-API-Key`, `Authorization`) diteruskan via `init.headers`.
- [ ] Endpoint ber-HMAC: pakai `fetch()` langsung + dokumentasikan alasannya.
- [ ] Kalau menambah perilaku helper: tulis/update unit test di `src/lib/http.test.ts`
      **dan** `workers/shared/http.test.js` (keduanya mengunci kontrak yang sama).
- [ ] Bila ada duplikasi dua helper (TS vs JS) tidak sinkron — ini bug.

---

## 4. Scope pemakaian & hasil audit (server-side)

Helper ini dikhususkan untuk **HTTP keluar server-side** (app Wavio di
Cloudflare Workers maupun worker standalone). Status audit **2026-09-05**:

| Area | Status | Keterangan |
|---|---|---|
| `src/lib/openwa.ts` | ✅ helper | `request()` serialize body/query via `jsonFetch`/`getJson`; `getMedia`/`getProfilePicture` = download media mentah (raw fetch, sengaja) |
| `src/lib/providers/tripay.ts` | ✅ helper | body create via `postJson`, GET via `getJson` |
| `src/app/api/auth/register/route.ts` | ✅ helper | `postJson` ke worker siteverify (lokasi bug asli) |
| Route handler lain `src/app/api/*` | ✅ n/a | tidak ada `fetch()` langsung (semua via lib) |
| `src/lib/nalaniagaSso.ts`, `src/lib/webhookDelivery.ts` | ✅ raw (sengaja) | HMAC atas raw body — fetch manual + komentar |
| Workers `template-sync`, `campaign-dispatch`, `platform-broadcast` | ✅ helper | `workers/shared/http.js` |
| Workers `webhook-delivery`, `turnstile-siteverify` | ✅ raw (sengaja) | HMAC raw body / FormData |

Cara memverifikasi server-side tetap bersih (ulangi sewaktu-waktu):

```bash
# Semua fetch di src di luar test — seharusnya HANYA: src/lib/http.ts,
# src/lib/nalaniagaSso.ts, src/lib/openwa.ts + client pages/components (bukan
# target helper — lihat bawah).
grep -rln "fetch(" src --include=*.ts --include=*.tsx | grep -v test
```

### Client (browser → `/api/*` sendiri): sengaja DI LUAR scope

Halaman & komponen `use client` memanggil route API Wavio sendiri dari
browser dgn `fetch` polos. Ini **sengaja bukan** target helper:

1. Receiver adalah route sendiri (`/api/*`) — kita kontrol keduanya; seluruh
   body sudah `JSON.stringify` + `Content-Type: application/json` yang benar
   (audit 2026-09-05), bukan kelas bug raw-string.
2. Banyak call site memakai `DELETE` tanpa body atau `FormData` — tak ada
   helper untuk bentuk itu; konversi parsial justru bikin pola campur.
3. Beberapa `fetch` memakai `AbortSignal` (cancel request) — helper tidak
   menambah nilai di sana.
4. Teks contoh kode di `docs/*` (mis. `docs/page.tsx`, `docs/integrations/`)
   adalah dokumentasi API publik utk pelanggan — tetap `fetch` polos, bukan
   dieksekusi oleh server.

Aturan praktis: **fetch keluar server-side baru → wajib helper**; client
same-origin boleh tetap `fetch` biasa.

---

## 5. Menjalankan test

```bash
# Full suite — SELALU dari dalam satu checkout (bukan dari root saat ada
# .worktrees/ aktif): vitest exclude "**/.worktrees/**" mencegah dua pohon
# kode tercampur dalam satu proses.
npm run test            # app
npx vitest run src/lib/http.test.ts workers/shared/http.test.js   # helper saja
```
