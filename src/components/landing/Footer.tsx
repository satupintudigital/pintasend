import Link from "next/link";

const columns = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "#fitur" },
      { label: "Cara Kerja", href: "#cara-kerja" },
      { label: "Harga", href: "#harga" },
    ],
  },
  {
    title: "Developer",
    links: [
      { label: "Dokumentasi API", href: "#api" },
      { label: "Webhook", href: "#api" },
    ],
  },
  {
    title: "Perusahaan",
    links: [
      { label: "Kebijakan Privasi", href: "/privacy" },
      { label: "Syarat & Ketentuan", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-[1.2fr_2fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5 py-1.5 font-display font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
              W
            </span>
            wavio
          </Link>
          <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-fg-faint">
            WhatsApp API gateway untuk bisnis Indonesia. Dibuat oleh Satu Pintu Digital.
          </p>
          <p className="mt-6 flex items-center gap-2 font-mono text-xs text-fg-muted">
            <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
            Semua sistem operasional
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-fg">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="inline-block py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line-soft px-5 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-fg-faint sm:flex-row">
          <p>© 2026 Wavio · Satu Pintu Digital</p>
          <p className="font-mono">Dibuat di Indonesia 🇮🇩</p>
        </div>
      </div>
    </footer>
  );
}
