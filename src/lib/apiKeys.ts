// Pure function API key — tanpa import DB/binding sehingga aman di-unit-test
// (lihat apiKeys.test.ts) dan aman dipakai dari mana pun (server/edge).

// Key mentah hanya ditampilkan SEKALI saat dibuat — setelah itu hanya hash
// (SHA-256) yang disimpan. Prefix utk identifikasi visual di dashboard.
export const API_KEY_PREFIX = "pintasend_";

export function generateApiKeyRaw(): { raw: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const raw = `${API_KEY_PREFIX}${hex}`;
  return { raw, prefix: raw.slice(0, 12) };
}

export async function hashApiKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
