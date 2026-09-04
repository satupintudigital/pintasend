"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartLineUp,
  ClipboardText,
  GearSix,
  House,
  Invoice,
  Megaphone,
  Receipt,
  Stack,
  UsersThree,
} from "@phosphor-icons/react";

const items = [
  { href: "/platform", label: "Ringkasan", icon: House },
  { href: "/platform/metrics", label: "Metrik", icon: ChartLineUp },
  { href: "/platform/plans", label: "Plan", icon: Stack },
  { href: "/platform/tenants", label: "Tenant", icon: UsersThree },
  { href: "/platform/broadcasts", label: "Broadcast", icon: Megaphone },
  { href: "/platform/orders", label: "Orders", icon: Receipt },
  { href: "/platform/invoices", label: "Invoice", icon: Invoice },
  { href: "/platform/audit", label: "Audit", icon: ClipboardText },
  { href: "/platform/settings", label: "Pengaturan", icon: GearSix },
];

export function PlatformSidebar() {
  const pathname = usePathname();
  return (
    <nav className="mt-8 space-y-1">
      <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
        Platform
      </p>
      {items.map((it) => {
        const active =
          pathname === it.href ||
          (it.href !== "/platform" && pathname.startsWith(it.href));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-surface-2 text-fg font-semibold" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg"
            }`}
          >
            <it.icon size={17} className={active ? "text-accent-bright" : undefined} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
