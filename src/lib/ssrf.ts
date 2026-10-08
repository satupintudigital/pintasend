// Guard SSRF best-effort untuk URL webhook milik client (PintaSend akan fetch URL
// ini saat meneruskan event). Tidak ada resolusi DNS (Workers tidak punya
// node:dns yang andal) — guard ini menangkap:
//   1. Protokol non-http(s)
//   2. Kredensial di URL (user:pass@)
//   3. Host berupa IP literal pada rentang private / link-local / loopback /
//      multicast / reserved (IPv4 & IPv6)
//   4. Hostname internal yang jelas (localhost, *.local, *.internal, *.lan, …)
//
// Catatan: hostname yang me-resolve ke IP private tetap lolos (tanpa DNS).
// Ini risiko yang didokumentasikan — OpenWA juga punya guard serupa.

export function isSafeWebhookUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;

  const host = u.hostname.toLowerCase();
  return !isInternalHostname(host) && !isPrivateIpLiteral(host);
}

function isInternalHostname(host: string): boolean {
  if (host === "localhost") return true;
  // TLD/subdomain yang jelas internal atau non-routable.
  const internalSuffixes = [".localhost", ".local", ".internal", ".lan", ".home", ".localdomain", ".invalid", ".test", ".example"];
  return internalSuffixes.some((s) => host.endsWith(s));
}

function isPrivateIpLiteral(host: string): boolean {
  // URL.hostname IPv6 bisa menyertakan kurung siku — strip dulu.
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":")) {
    // IPv4-mapped (::ffff:a.b.c.d). WHATWG URL men-serialisasi jadi bentuk HEX
    // (mis. ::ffff:127.0.0.1 → ::ffff:7f00:1) — tangani dua-duanya.
    if (h.startsWith("::ffff:")) return isPrivateIpv4Mapped(h.slice(7));
    if (h === "::" || h === "::1") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
    return false;
  }
  return isPrivateIpv4(h);
}

/** ::ffff:<suffix> → dotted decimal, lalu cek rentang private. */
function isPrivateIpv4Mapped(suffix: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(suffix)) return isPrivateIpv4(suffix);
  // Bentuk hex: 2 atau 4 group 1–4 digit (mis. "7f00:1" → 127.0.0.1).
  const bytes: number[] = [];
  for (const g of suffix.split(":")) {
    const padded = g.padStart(4, "0");
    if (!/^[0-9a-f]{4}$/.test(padded)) return false;
    bytes.push(parseInt(padded.slice(0, 2), 16), parseInt(padded.slice(2), 16));
  }
  if (bytes.length !== 4) return false;
  return isPrivateIpv4(bytes.join("."));
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    a >= 224 // multicast + reserved
  );
}
