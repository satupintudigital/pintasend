// ─── Helper fetch HTTP bersama utk worker Workers (JS murni, tanpa deps) ──
// Sibling dari src/lib/http.ts — kontrak sama, tapi bahasa JS polos karena
// worker (deploy unit terpisah via wrangler) tidak bisa import TS src/lib.
// Dipakai bersama oleh worker yang memanggil API JSON eksternal (mis.
// template-sync & campaign-dispatch → OpenWA). Kontrak dijamin di sini:
//   - jsonFetch/postJson (POST/PUT/PATCH): body SELALU di-JSON.stringify
//     (tidak pernah mengirim string telanjang) dan Content-Type:
//     application/json DIPAKSA.
//   - getJson (GET): query object diserialisasi terpusat (URLSearchParams),
//     bukan string manual — encoding tak bisa salah.
//
// Catatan: endpoint ber-HMAC atas raw body (webhook-delivery) TIDAK memakai
// helper ini — butuh body string sama persis utk signature.

/** POST/PUT/PATCH dgn body sebagai JSON. Mengembalikan Response mentah. */
export async function jsonFetch(method, url, body, init = {}, fetchImpl = fetch) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return fetchImpl(url, { ...init, method, headers, body: JSON.stringify(body) });
}

/** POST body sebagai JSON. Mengembalikan Response mentah. */
export function postJson(url, body, init = {}, fetchImpl = fetch) {
  return jsonFetch("POST", url, body, init, fetchImpl);
}

/** GET endpoint JSON — query object diserialisasi; Response mentah dikembalikan. */
export async function getJson(url, init = {}, fetchImpl = fetch) {
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
