"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowsClockwise,
  CheckCircle,
  ChatCircleText,
  CreditCard,
  Devices,
  PaperPlaneTilt,
  Plus,
  QrCode,
  Robot,
  Users,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import { Spotlight } from "@/components/Spotlight";
import { MessageTrendChart } from "./MessageTrendChart";
import { QuickSendModal } from "./QuickSendModal";
import { DeveloperQuickstart } from "./DeveloperQuickstart";
import type { DashboardOverviewData } from "@/lib/dashboard";

export function DashboardOverview({
  data,
  userName,
  formattedDate,
  greetingText,
}: {
  data: DashboardOverviewData;
  userName: string;
  formattedDate: string;
  greetingText: string;
}) {
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const { metrics, trend7Days, recentMessages, devices } = data;

  const todayDiff = metrics.todayMessages - metrics.yesterdayMessages;

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Command Center
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl text-fg">
            {greetingText}, {userName.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-fg-muted">{formattedDate}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setQuickSendOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all hover:bg-accent-bright active:scale-[0.98]"
          >
            <PaperPlaneTilt size={16} weight="bold" /> Kirim Pesan Cepat
          </button>
          <Link
            href="/dashboard/devices"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Devices size={16} /> Kelola Device
          </Link>
        </div>
      </div>

      {/* 6 Metrics Overview Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: Devices */}
        <Spotlight className="rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/30">
          <div className="flex items-center justify-between text-fg-muted">
            <span className="text-xs font-medium">Device WhatsApp</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
              <Devices size={16} />
            </span>
          </div>
          <p className="bk-tabular mt-3 font-display text-2xl font-semibold text-fg">
            {metrics.readyDevices}
            <span className="text-sm font-normal text-fg-faint"> / {metrics.totalDevices} ready</span>
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                metrics.readyDevices > 0 ? "bg-accent-bright animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-fg-faint">
              {metrics.readyDevices > 0 ? "Koneksi stabil" : "Tidak ada device ready"}
            </span>
          </div>
        </Spotlight>

        {/* Card 2: Hari Ini */}
        <Spotlight className="rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/30">
          <div className="flex items-center justify-between text-fg-muted">
            <span className="text-xs font-medium">Pesan Hari Ini</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Waveform size={16} />
            </span>
          </div>
          <p className="bk-tabular mt-3 font-display text-2xl font-semibold text-fg">
            {metrics.todayMessages}
          </p>
          <p className="mt-2 text-xs text-fg-faint">
            {todayDiff >= 0 ? `+${todayDiff}` : todayDiff} vs kemarin ({metrics.yesterdayMessages})
          </p>
        </Spotlight>

        {/* Card 3: Bulan Berjalan */}
        <Spotlight className="rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/30">
          <div className="flex items-center justify-between text-fg-muted">
            <span className="text-xs font-medium">Pesan Bulan Ini</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <ChatCircleText size={16} />
            </span>
          </div>
          <p className="bk-tabular mt-3 font-display text-2xl font-semibold text-fg">
            {metrics.monthMessages}
            {metrics.maxMessagesPerMonth != null && (
              <span className="text-xs font-normal text-fg-faint"> / {metrics.maxMessagesPerMonth}</span>
            )}
          </p>
          {metrics.maxMessagesPerMonth != null ? (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${Math.min(100, (metrics.monthMessages / metrics.maxMessagesPerMonth) * 100)}%`,
                }}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-fg-faint">Pemakaian bulan berjalan</p>
          )}
        </Spotlight>

        {/* Card 4: Saldo & Paket */}
        <Spotlight className="rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/30">
          <div className="flex items-center justify-between text-fg-muted">
            <span className="text-xs font-medium">Paket & Saldo</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CreditCard size={16} />
            </span>
          </div>
          <p className="mt-3 truncate font-display text-xl font-semibold text-fg">
            {metrics.planName}
          </p>
          <p className="mt-2 font-mono text-xs text-accent-bright">
            {metrics.balance.toLocaleString("id-ID")} kredit
          </p>
        </Spotlight>

        {/* Card 5: Kontak CRM */}
        <Spotlight className="rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/30">
          <div className="flex items-center justify-between text-fg-muted">
            <span className="text-xs font-medium">Total Kontak</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Users size={16} />
            </span>
          </div>
          <p className="bk-tabular mt-3 font-display text-2xl font-semibold text-fg">
            {metrics.totalContacts}
          </p>
          <Link href="/dashboard/kontak" className="mt-2 block text-xs text-fg-faint hover:text-fg">
            Kelola buku kontak →
          </Link>
        </Spotlight>

        {/* Card 6: Otomasi */}
        <Spotlight className="rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/30">
          <div className="flex items-center justify-between text-fg-muted">
            <span className="text-xs font-medium">Otomasi & Bot</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Robot size={16} />
            </span>
          </div>
          <p className="bk-tabular mt-3 font-display text-2xl font-semibold text-fg">
            {metrics.activeBotRules}
            <span className="text-xs font-normal text-fg-faint"> bot rules</span>
          </p>
          <p className="mt-2 text-xs text-fg-faint">
            {metrics.runningCampaigns > 0 ? `${metrics.runningCampaigns} campaign aktif` : "Tidak ada blast berjalan"}
          </p>
        </Spotlight>
      </div>

      {/* Middle Section: 7-Day Trend Chart & Developer Quickstart */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MessageTrendChart data={trend7Days} />
        </div>
        <div className="lg:col-span-1">
          <DeveloperQuickstart />
        </div>
      </div>

      {/* Bottom Section: Device Health List & Recent Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Live Device Health Widget */}
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-fg">Status Perangkat</h2>
              <p className="text-xs text-fg-muted">Koneksi WhatsApp session aktif.</p>
            </div>
            <Link
              href="/dashboard/devices"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-bright hover:underline"
            >
              Lihat semua <ArrowRight size={14} />
            </Link>
          </div>

          {devices.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm font-medium text-fg">Belum ada perangkat tertaut</p>
              <p className="mt-1 text-xs text-fg-muted">
                Tambahkan perangkat untuk mulai mengirim dan menerima pesan.
              </p>
              <Link
                href="/dashboard/devices"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink"
              >
                <Plus size={14} weight="bold" /> Tambah Device
              </Link>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-line-soft">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        d.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : d.status === "qr_ready"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      <Devices size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-fg">{d.label}</p>
                      <p className="font-mono text-xs text-fg-faint">
                        {d.phone ? `+${d.phone}` : "Nomor belum tertaut"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                        d.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : d.status === "qr_ready"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          d.status === "ready"
                            ? "bg-emerald-400"
                            : d.status === "qr_ready"
                            ? "bg-amber-400 animate-ping"
                            : "bg-red-400"
                        }`}
                      />
                      {d.status}
                    </span>
                    <Link
                      href="/dashboard/devices"
                      className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-2 hover:text-fg"
                      title="Kelola"
                    >
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Message Activity Feed */}
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-fg">Aktivitas Terkini</h2>
              <p className="text-xs text-fg-muted">Log pesan terbaru masuk & keluar.</p>
            </div>
            <Link
              href="/dashboard/pesan"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-bright hover:underline"
            >
              Riwayat lengkap <ArrowRight size={14} />
            </Link>
          </div>

          {recentMessages.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm font-medium text-fg">Belum ada aktivitas pesan</p>
              <p className="mt-1 text-xs text-fg-muted">
                Pesan yang dikirim atau diterima akan muncul di sini secara real-time.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-line-soft">
              {recentMessages.map((m) => {
                const cleanPhone = m.chatId.replace(/@c\.us$/, "");
                const isOut = m.direction === "outgoing";
                return (
                  <div key={m.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                          isOut ? "bg-accent/10 text-accent-bright" : "bg-sky-400/10 text-sky-400"
                        }`}
                      >
                        {isOut ? "OUT" : "IN"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-medium text-fg">{cleanPhone}</p>
                        <p className="mt-0.5 truncate text-xs text-fg-muted max-w-[280px]">
                          {m.body || "[Media / Kosong]"}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-fg-faint bg-surface-2">
                        {m.status}
                      </span>
                      <p className="mt-0.5 font-mono text-[10px] text-fg-faint">
                        {new Date(m.triggeredAt).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Send Modal */}
      <QuickSendModal
        devices={devices}
        isOpen={quickSendOpen}
        onClose={() => setQuickSendOpen(false)}
      />
    </div>
  );
}
