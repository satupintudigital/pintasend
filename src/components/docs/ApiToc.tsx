"use client";

import { useEffect, useState } from "react";

export const apiTocItems = [
  { id: "base-url", label: "Base URL" },
  { id: "autentikasi", label: "Autentikasi" },
  { id: "daftar-endpoint", label: "Daftar endpoint" },
  { id: "kirim-pesan", label: "Kirim pesan" },
  { id: "kirim-template", label: "Kirim template" },
  { id: "blokir-kontak", label: "Blokir kontak" },
  { id: "tandai-dibaca", label: "Tandai dibaca" },
  { id: "status-layanan", label: "Status layanan" },
  { id: "webhook", label: "Webhook" },
  { id: "x-request-id", label: "X-Request-Id" },
  { id: "rate-limit", label: "Rate limit" },
  { id: "kode-status", label: "Kode status" },
];

/* TOC kanan dengan scrollspy — section aktif disorot saat melewatinya. */
export function ApiToc() {
  const [active, setActive] = useState(apiTocItems[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    for (const { id } of apiTocItems) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Daftar isi halaman">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
        Di halaman ini
      </p>
      <ul className="mt-3 border-l border-line-soft">
        {apiTocItems.map((it) => {
          const isActive = active === it.id;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${
                  isActive
                    ? "border-accent-bright font-medium text-fg"
                    : "border-transparent text-fg-faint hover:text-fg"
                }`}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
