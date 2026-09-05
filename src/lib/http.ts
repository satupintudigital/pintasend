// ─── Helper fetch HTTP terpusat ────────────────────────────────────────────
// Satu-satunya jalur POST berbody JSON ke endpoint eksternal. Kontrak dijamin
// di sini sehingga tidak bisa salah lagi:
//   - method selalu POST
//   - body SELALU di-JSON.stringify (nilai JSON apa pun, termasuk string yang
//     dibungkus literal) — tidak pernah mengirim string telanjang yang membuat
//     request.json() di receiver gagal (regresi bug token Turnstile di route
//     register: raw string → siteverify worker selalu menolak).
//   - header Content-Type: application/json DIPAKSA (tidak bisa ditimpa).
//
// Pemakaian server-side. fetchImpl di-inject utk unit test.
//
// Bila endpoint menerima body mentah yang sudah ter-serialize dan Wajib sama
// persis utk keperluan HMAC (mis. webhook delivery yang ditandatangani atas
// raw body), jangan pakai helper ini — pakai fetch() langsung dgn body string
// hasil JSON.stringify sendiri (lihat webhookDelivery.ts / nalaniagaSso.ts).

export type PostJsonInit = Omit<RequestInit, "method" | "body">;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Method HTTP yang membawa body JSON ter-serialize. */
export type JsonMethod = "POST" | "PUT" | "PATCH";

/**
 * Request method (POST/PUT/PATCH) dgn body sebagai JSON. Kontrak yang sama
 * dgn postJson — body SELALU di-JSON.stringify, Content-Type dipaksa — tapi
 * method bisa ditentukan pemanggil (dipakai openwa.ts utk PUT/PATCH).
 * Mengembalikan Response mentah — caller membaca.
 */
export async function jsonFetch(
  method: JsonMethod,
  url: string,
  body: unknown,
  init: PostJsonInit = {},
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  return fetchImpl(url, {
    ...init,
    method,
    headers,
    body: JSON.stringify(body),
  });
}

/** POST body sebagai JSON. Mengembalikan Response mentah — caller membaca. */
export function postJson(
  url: string,
  body: unknown,
  init: PostJsonInit = {},
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<Response> {
  return jsonFetch("POST", url, body, init, fetchImpl);
}
