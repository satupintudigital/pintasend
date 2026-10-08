// Indeks pencarian dokumentasi — sumber data untuk pencarian Cmd+K.
// Entri dipetakan manual agar presisi (judul, konteks, dan kata kunci yang
// mudah dicari orang Indonesia). Seluruh entri menunjuk ke halaman docs.

export interface SearchEntry {
  href: string;
  page: string;
  title: string;
  hint?: string;
  keywords: string[];
}

export const docsSearchEntries: SearchEntry[] = [
  // ── Ringkasan & Mulai Cepat ──
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Mulai cepat — kirim pesan pertama",
    hint: "curl · Authorization Bearer · POST /v1/messages",
    keywords: ["mulai", "cepat", "kirim", "pesan", "pertama", "curl", "command line", "bash"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Mulai cepat — Node.js",
    hint: "fetch · process.env.PINTSEND_KEY",
    keywords: ["node", "nodejs", "javascript", "fetch", "js", "npm"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Respons sukses",
    hint: "ok · messageId · deviceId",
    keywords: ["respons", "json", "messageid", "ok", "sukses", "contoh"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Langkah 1 — Buat API key",
    hint: "Dashboard → API Key → Buat",
    keywords: ["api key", "kunci", "token", "dashboard", "buat", "key"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Langkah 2 — Sambungkan device",
    hint: "Device → Tambah → scan QR dengan WhatsApp",
    keywords: ["device", "qr", "scan", "sambung", "whatsapp", "hp", "nomor"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Langkah 3 — Kirim pesan",
    hint: "POST /v1/messages · Authorization Bearer",
    keywords: ["kirim", "pesan", "post", "v1/messages", "langkah"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Format nomor yang didukung",
    hint: "62812… internasional · 0812… lokal — dinormalisasi otomatis",
    keywords: ["nomor", "format", "628", "08", "internasional", "lokal", "normalisasi", "telepon"],
  },
  {
    href: "/docs",
    page: "Ringkasan",
    title: "Kebijakan anti-spam",
    hint: "Hanya kirim ke pelanggan yang menyetujui",
    keywords: ["spam", "blokir", "persetujuan", "kebijakan", "aturan", "akun"],
  },

  // ── Endpoint API ──
  {
    href: "/docs/api#base-url",
    page: "Endpoint API",
    title: "Base URL",
    hint: "https://pintasend.satupintudigital.co.id",
    keywords: ["base url", "url", "endpoint", "domain", "alamat"],
  },
  {
    href: "/docs/api#autentikasi",
    page: "Endpoint API",
    title: "Autentikasi — Bearer token",
    hint: "Header Authorization · Dashboard → API Key",
    keywords: ["autentikasi", "auth", "bearer", "api key", "header", "authorization", "token", "login"],
  },
  {
    href: "/docs/api#daftar-endpoint",
    page: "Endpoint API",
    title: "Daftar endpoint",
    hint: "POST /v1/messages · GET /api/health",
    keywords: ["endpoint", "daftar", "metode", "method", "list"],
  },
  {
    href: "/docs/api#kirim-pesan",
    page: "Endpoint API",
    title: "POST /v1/messages — kirim pesan",
    hint: "Body: to · text · deviceId (opsional)",
    keywords: ["kirim", "pesan", "post", "messages", "body", "to", "text", "deviceid"],
  },
  {
    href: "/docs/api#kirim-pesan",
    page: "Endpoint API",
    title: "Field body request",
    hint: "to (wajib) · text (wajib) · deviceId (opsional)",
    keywords: ["field", "body", "wajib", "opsional", "parameter", "request"],
  },
  {
    href: "/docs/api#kirim-pesan",
    page: "Endpoint API",
    title: "Batasan pengiriman",
    hint: "text ≤ 4.096 karakter · format nomor 62…/08…/8…",
    keywords: ["batasan", "limit", "4096", "karakter", "format", "nomor"],
  },
  {
    href: "/docs/api#kirim-pesan",
    page: "Endpoint API",
    title: "Contoh respons & error",
    hint: "200 OK · 401 · 409 · 429",
    keywords: ["contoh", "respons", "error", "gagal", "401", "409", "429"],
  },
  {
    href: "/docs/api#status-layanan",
    page: "Endpoint API",
    title: "GET /api/health — status layanan",
    hint: "Monitoring uptime tanpa autentikasi",
    keywords: ["health", "status", "layanan", "uptime", "monitoring", "cek"],
  },
  {
    href: "/docs/api#rate-limit",
    page: "Endpoint API",
    title: "Rate limit",
    hint: "60 request/menit per tenant · header Retry-After",
    keywords: ["rate limit", "batas", "60", "menit", "retry-after", "429", "pembatasan"],
  },
  {
    href: "/docs/api#kode-status",
    page: "Endpoint API",
    title: "Kode status",
    hint: "200 · 400 · 401 · 404 · 409 · 429 · 500 · 502",
    keywords: ["status", "kode", "error", "200", "401", "404", "409", "429", "500", "502"],
  },

  // ── Integrasi ──
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Studi kasus: NalaNiaga",
    hint: "Notifikasi order otomatis dari platform toko",
    keywords: ["nalaniaga", "studi", "kasus", "toko", "integrasi", "order", "notifikasi", "crm"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Contoh cURL",
    hint: "Satu perintah POST dengan Bearer token",
    keywords: ["curl", "bash", "contoh", "terminal"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Contoh Python",
    hint: "requests · json",
    keywords: ["python", "requests", "contoh", "pip"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Contoh PHP",
    hint: "curl_init · json_encode",
    keywords: ["php", "curl", "curl_init", "contoh", "composer"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Praktik terbaik",
    hint: "Secret manager · retry 409 · baca Retry-After · anti-spam",
    keywords: ["praktik", "terbaik", "best practice", "secret", "retry", "spam", "device"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Peta jalan — webhook pesan masuk",
    hint: "message.received · session.status",
    keywords: ["webhook", "peta", "jalan", "roadmap", "pesan", "masuk", "event", "realtime"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Peta jalan — media & dokumen",
    hint: "Gambar · video · PDF · stiker",
    keywords: ["media", "gambar", "video", "pdf", "stiker", "dokumen", "file"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Peta jalan — riwayat pesan",
    hint: "Pesan masuk/keluar per device",
    keywords: ["riwayat", "pesan", "history", "log", "inbox"],
  },
  {
    href: "/docs/integrations",
    page: "Integrasi",
    title: "Peta jalan — template pesan",
    hint: "Template terstruktur untuk notifikasi konsisten",
    keywords: ["template", "notifikasi", "pesan", "terstruktur"],
  },
];
