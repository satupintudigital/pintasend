"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Devices, House, Key, UsersThree, WebhooksLogo } from "@phosphor-icons/react";

const items = [
  { href: "/dashboard", label: "Beranda", icon: House },
  { href: "/dashboard/devices", label: "Device", icon: Devices },
];

const ownerItems = [
  { href: "/dashboard/pengguna", label: "Pengguna", icon: UsersThree },
  { href: "/dashboard/api-keys", label: "API Key", icon: Key },
  { href: "/dashboard/webhook", label: "Webhook", icon: WebhooksLogo },
];

export function SidebarNav({
  horizontal = false,
  canManageUsers = false,
}: {
  horizontal?: boolean;
  canManageUsers?: boolean;
}) {
  const pathname = usePathname();
  const visible = canManageUsers ? [...items, ...ownerItems] : items;

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${horizontal ? "py-3" : "py-2.5"} ${
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
      {visible.map((it) => {
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
