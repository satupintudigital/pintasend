"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatCircleText,
  CreditCard,
  Devices,
  House,
  Key,
  Megaphone,
  Users,
  UsersThree,
  WebhooksLogo,
  Tag,
  Radio,
  UserCircle,
  Robot,
} from "@phosphor-icons/react";

const items = [
  { href: "/dashboard", label: "Beranda", icon: House },
  { href: "/dashboard/devices", label: "Device", icon: Devices },
  { href: "/dashboard/pesan", label: "Riwayat Pesan", icon: ChatCircleText },
  { href: "/dashboard/kontak", label: "Kontak", icon: Users },
  { href: "/dashboard/labels", label: "Labels", icon: Tag },
  { href: "/dashboard/bot", label: "Auto-Reply Bot", icon: Robot },
  { href: "/dashboard/channels", label: "Channels", icon: Radio },
  { href: "/dashboard/profile", label: "Profil", icon: UserCircle },
];


// Langganan (billing self-serve) — owner & tenant_admin; TETAP tampil saat
// tenant pending agar aktivasi bisa diselesaikan.
const billingItem = [{ href: "/dashboard/langganan", label: "Langganan", icon: CreditCard }];

// Kelola member tenant (owner & tenant_admin) — halaman Members.
const memberAdminItems = [
  { href: "/dashboard/members", label: "Members", icon: UsersThree },
];

// Owner-only: kelola API key & webhook tenant.
const ownerItems = [
  { href: "/dashboard/api-keys", label: "API Key", icon: Key },
  { href: "/dashboard/webhook", label: "Webhook", icon: WebhooksLogo },
];

// Modul WA Campaign — hanya tampil bila tenant punya addon 'campaign' aktif.
const campaignItems = [
  { href: "/dashboard/campaign", label: "Campaign", icon: Megaphone },
];

export function SidebarNav({
  horizontal = false,
  canManageUsers = false,
  isOwner = false,
  hasCampaign = false,
  pending = false,
}: {
  horizontal?: boolean;
  canManageUsers?: boolean;
  isOwner?: boolean;
  hasCampaign?: boolean;
  /** Tenant pending (belum bayar paket) → sembunyikan menu operasional. */
  pending?: boolean;
}) {
  const pathname = usePathname();
  // Saat pending hanya Beranda, Profil, dan Langganan yang tampil — sisanya
  // aktif setelah pembayaran pertama lunas.
  const visible = pending
    ? [items[0], ...billingItem, items[items.length - 1]]
    : [
        ...items,
        ...(hasCampaign ? campaignItems : []),
        ...(canManageUsers ? [...billingItem, ...memberAdminItems] : []),
        ...(isOwner ? ownerItems : []),
      ];

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors ${
      horizontal ? "py-2.5" : "py-2.5"
    } ${
      active
        ? "bg-surface-2 text-fg font-semibold"
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
              <span className="bk-pop ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
