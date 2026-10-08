// ─── Helper fetch HTTP terpusat ────────────────────────────────────────────
// Satu-satunya jalur request JSON ke endpoint eksternal (app PintaSend).
// Kontrak dijamin di sini sehingga tidak bisa salah lagi:
//   - jsonFetch/postJson (POST/PUT/PATCH): body SELALU di-JSON.stringify
//     (tidak pernah mengirim string telanjang yang membuat request.json() di
//     receiver gagal — regresi bug token Turnstile di route register) dan
//     Content-Type: application/json DIPAKSA.
//   - getJson (GET): query object diserialisasi terpusat (URLSearchParams),
//     bukan string manual — encoding tak bisa salah.
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

/** Nilai yang boleh muncul di query string (null/undefined = di-skip). */
export type JsonQueryValue = string | number | boolean | null | undefined;

/** Query terstruktur — diserialisasi terpusat (kunci berulang = array). */
export type JsonQuery = Record<string, JsonQueryValue | readonly JsonQueryValue[]>;

export interface GetJsonInit extends Omit<RequestInit, "method" | "body"> {
  /** Params query; null/undefined di-skip, array diulang per nilai. */
  query?: JsonQuery;
}

/**
 * GET endpoint JSON. Query object diserialisasi di sini (bukan string
 * manual di call site) sehingga encoding tak bisa salah — konsisten dgn
 * postJson/jsonFetch utk body. Mengembalikan Response mentah — caller membaca.
 */
export async function getJson(
  url: string,
  init: GetJsonInit = {},
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<Response> {
  const { query, ...rest } = init;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (item === undefined || item === null) continue;
        params.append(key, String(item));
      }
    }
  }
  const qs = params.toString();
  const target = qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
  return fetchImpl(target, { ...rest, method: "GET" });
}
