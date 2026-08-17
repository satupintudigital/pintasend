"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Devices, House } from "@phosphor-icons/react";

const items = [
  { href: "/dashboard", label: "Beranda", icon: House },
  { href: "/dashboard/devices", label: "Device", icon: Devices },
];

export function SidebarNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-surface-2 text-fg"
        : "text-fg-muted hover:bg-surface-2/60 hover:text-fg"
    }`;

  return (
    <nav className={horizontal ? "flex items-center gap-1 overflow-x-auto" : "mt-8 space-y-1"}>
      {!horizontal && (
        <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
          Menu
        </p>
      )}
      {items.map((it) => {
        const active =
          pathname === it.href ||
          (it.href !== "/dashboard" && pathname.startsWith(it.href));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`${linkClass(active)} ${horizontal ? "shrink-0" : ""}`}
          >
            <it.icon
              size={17}
              className={active ? "text-accent-bright" : undefined}
            />
            {it.label}
            {active && !horizontal && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
