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
];

export function Footer() {
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 md:flex-row md:justify-between">
        <div className="max-w-[30ch]">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
              W
            </span>
            wavio
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg-faint">
            WhatsApp API gateway untuk bisnis Indonesia. Dibuat oleh Satu Pintu Digital.
          </p>
        </div>

        <div className="flex gap-16">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-fg">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-fg-muted transition-colors hover:text-fg">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line-soft px-5 py-6 text-center text-xs text-fg-faint">
        © 2026 Wavio - Satu Pintu Digital
      </div>
    </footer>
  );
}
