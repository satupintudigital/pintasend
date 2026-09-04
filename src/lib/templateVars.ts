// Parser placeholder template OpenWA — dipakai dashboard (form dinamis vars)
// dan validasi. Template menyimpan token {placeholder} (mis. {recipientName},
// {orderNumber}) yang disubstitusi OpenWA saat kirim. Token BUKAN regex bebas —
// hanya huruf/angka/underscore (aman untuk dijadikan nama field form).

const PLACEHOLDER_RE = /\{([A-Za-z0-9_]+)\}/g;

/** Token placeholder valid: 1+ huruf/angka/underscore (tanpa kurung). */
export function isPlaceholderToken(token: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(token);
}

/**
 * Ekstrak token placeholder unik dari teks, sesuai urutan kemunculan.
 * Token duplikat di-skip; token kosong / berisi spasi atau karakter khusus
 * diabaikan (bukan placeholder yang bisa diisi form).
 */
export function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const token = m[1];
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }
  return result;
}

export interface TemplateText {
  name: string;
  header?: string | null;
  body: string;
  footer?: string | null;
}

/** Placeholder gabungan dari header + body + footer sebuah template. */
export function placeholdersFromTemplate(tpl: TemplateText): string[] {
  const parts = [tpl.header ?? "", tpl.body, tpl.footer ?? ""];
  return extractPlaceholders(parts.join("\n"));
}
