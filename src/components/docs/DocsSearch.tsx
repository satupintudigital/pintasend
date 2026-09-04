"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, MagnifyingGlass } from "@phosphor-icons/react";
import { docsSearchEntries } from "@/lib/docs-search";

const SUGGESTIONS = ["kirim pesan", "api key", "rate limit", "webhook", "python"];

const pageBadge: Record<string, string> = {
  "Ringkasan": "bg-surface-2 text-fg-muted",
  "Endpoint API": "bg-accent/10 text-accent-bright",
  "Integrasi": "bg-surface-2 text-fg-muted",
};

function matches(entry: (typeof docsSearchEntries)[number], query: string) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const hay = [entry.title, entry.page, entry.hint ?? "", ...entry.keywords]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-faint">
      {children}
    </kbd>
  );
}

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const reduced = useReducedMotion();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return docsSearchEntries.filter((e) => matches(e, query));
  }, [query]);

  const openSearch = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActive(0);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  // Pintasan global: Cmd/Ctrl+K untuk toggle, "/" untuk buka (bila tidak mengetik).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) closeSearch();
        else openSearch();
        return;
      }
      if (e.key === "Escape" && open) {
        closeSearch();
        return;
      }
      if (e.key === "/" && !open) {
        const el = document.activeElement;
        const tag = el?.tagName;
        if (
          el &&
          (tag === "INPUT" ||
            tag === "TEXTAREA" ||
            (el as HTMLElement).isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openSearch, closeSearch]);

  // Fokus input + kunci scroll body saat terbuka.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Jaga hasil aktif tetap terlihat.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (href: string) => {
    closeSearch();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const r = results[active];
      if (r) go(r.href);
    } else if (e.key === "Tab") {
      // Trap ringan: siklus antara input dan hasil.
      e.preventDefault();
      const links = Array.from(
        listRef.current?.querySelectorAll("a") ?? [],
      ) as HTMLAnchorElement[];
      if (document.activeElement === inputRef.current) {
        (links[0] ?? inputRef.current)?.focus();
      } else {
        inputRef.current?.focus();
      }
    }
  };

  return (
    <>
      {/* Pemicu */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openSearch}
        aria-label="Buka pencarian dokumentasi (⌘K)"
        className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-surface-2/60 px-3 py-1.5 font-mono text-xs text-fg-muted transition-colors hover:border-line hover:text-fg active:scale-[0.97]"
      >
        <MagnifyingGlass size={13} />
        <span className="hidden sm:inline">Cari</span>
        <Kbd>⌘K</Kbd>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]"
            role="presentation"
            onKeyDown={onKeyDown}
          >
            {/* Backdrop */}
            <motion.div
              aria-hidden
              onClick={closeSearch}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2 }}
            />
            {/* Panel — entrance spring, tidak pakai bk-code-in lagi */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Pencarian dokumentasi"
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-[0_48px_120px_-40px_rgba(15,23,42,0.3)]"
              initial={reduced ? false : { opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: -8,
                scale: 0.98,
                transition: { duration: 0.15, ease: "easeIn" },
              }}
              transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
            >
              {/* Input */}
              <div className="flex items-center gap-3 border-b border-line-soft px-4">
                <MagnifyingGlass size={16} className="shrink-0 text-fg-faint" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Cari dokumentasi… (mis. kirim pesan, rate limit)"
                  aria-label="Kata kunci pencarian"
                  className="h-14 w-full bg-transparent font-sans text-sm text-fg outline-none placeholder:text-fg-faint"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label="Tutup pencarian"
                  className="flex h-7 shrink-0 items-center justify-center rounded-lg px-2 font-mono text-xs text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  esc
                </button>
              </div>

              {/* Hasil */}
              <div ref={listRef} className="max-h-[52vh] overflow-y-auto overscroll-contain">
                {!query.trim() ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-fg-muted">
                      Cari di seluruh dokumentasi — endpoint, contoh kode, kebijakan.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setQuery(s);
                            setActive(0);
                          }}
                          className="rounded-full border border-line bg-surface-2/40 px-3 py-1.5 font-mono text-xs text-fg-faint transition-colors hover:border-accent/40 hover:text-fg"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="font-display text-base font-semibold text-fg">
                      Tidak ada hasil untuk “{query}”
                    </p>
                    <p className="mt-1 text-sm text-fg-faint">
                      Periksa ejaan atau coba kata kunci lain.
                    </p>
                  </div>
                ) : (
                  <ul className="py-1">
                    {results.map((r, i) => (
                      <motion.li
                        key={r.href + r.title}
                        initial={reduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.25,
                          ease: [0.16, 1, 0.3, 1],
                          delay: Math.min(i * 0.035, 0.28),
                        }}
                      >
                        <motion.div
                          whileHover={reduced ? undefined : { x: 3 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        >
                          <Link
                            href={r.href}
                            data-idx={i}
                            onClick={() => closeSearch()}
                            onMouseEnter={() => setActive(i)}
                            className={`relative flex items-start gap-3 px-4 py-3 transition-colors ${
                              i === active ? "bg-surface-2" : ""
                            }`}
                          >
                            {i === active && (
                              <span
                                aria-hidden
                                className="absolute left-0 top-0 h-full w-0.5 bg-accent-bright"
                              />
                            )}
                            <span
                              className={`mt-0.5 w-20 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider ${
                                pageBadge[r.page] ?? "bg-surface-2 text-fg-muted"
                              }`}
                            >
                              {r.page}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-fg">
                                {r.title}
                              </span>
                              {r.hint && (
                                <span className="mt-0.5 block truncate text-xs text-fg-faint">
                                  {r.hint}
                                </span>
                              )}
                            </span>
                            <ArrowUpRight
                              size={14}
                              className="mt-1 shrink-0 text-fg-faint"
                            />
                          </Link>
                        </motion.div>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer hints */}
              <div className="flex items-center justify-between border-t border-line-soft px-4 py-2.5 font-mono text-[10px] text-fg-faint">
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd> navigasi
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd> buka
                  </span>
                </span>
                <span className="hidden sm:inline">
                  {query.trim() ? `${results.length} hasil` : "3 halaman"}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
