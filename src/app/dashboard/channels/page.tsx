"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Warning,
  Radio,
  X,
  Users,
  SpinnerGap,
} from "@phosphor-icons/react";
import { Spotlight } from "@/components/Spotlight";

interface Device {
  id: string;
  label: string;
  status: string;
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  subscriberCount?: number;
}

export default function ChannelsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((data) => {
        const ready = (data.devices ?? []).filter((d: Device) => d.status === "ready");
        setDevices(ready);
        if (ready.length > 0) setSelectedDevice(ready[0].id);
        setLoading(false);
      })
      .catch(() => { setError("Gagal memuat device"); setLoading(false); });
  }, []);

  const loadChannels = useCallback(async () => {
    if (!selectedDevice) return;
    setChannelsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/channels`);
      const data = await res.json();
      if (!res.ok) {
        // 501 = engine limitation (Baileys doesn't support channels)
        if (res.status === 501) {
          setChannels([]);
          setError("Fitur channels belum tersedia untuk device ini. Hubungi admin untuk info lebih lanjut.");
          return;
        }
        throw new Error(data.error ?? "Gagal memuat channels");
      }
      setChannels(data.channels ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChannelsLoading(false);
    }
  }, [selectedDevice]);

  useEffect(() => { if (selectedDevice) loadChannels(); }, [selectedDevice, loadChannels]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || submitting || !selectedDevice) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Gagal membuat channel");
      }
      setCreateOpen(false);
      setFormName("");
      setFormDesc("");
      loadChannels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Channels</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            WhatsApp Channels
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Kelola channel WhatsApp untuk broadcast konten.
          </p>
        </div>
        {selectedDevice && (
          <button
            onClick={() => { setFormName(""); setFormDesc(""); setCreateOpen(true); }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.97]"
          >
            <Plus size={16} weight="bold" />
            Buat Channel
          </button>
        )}
      </div>

      {error && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {error}
        </p>
      )}

      {/* Device selector */}
      {devices.length > 0 && (
        <div className="mt-6">
          <label className="mb-1.5 block text-sm font-medium text-fg">Pilih Device</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="min-h-12 w-full max-w-sm rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface p-5">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-2" />
                <div className="mt-3 h-3.5 w-28 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        ) : devices.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-bright">
              <Radio size={28} />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Belum ada device</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">Hubungkan device dulu</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
              Hubungkan nomor WhatsApp ke Wavio untuk membuat channel.
            </p>
          </div>
        ) : channelsLoading ? (
          <div className="flex items-center gap-3 text-fg-muted">
            <SpinnerGap size={20} className="animate-spin text-accent" />
            <span className="text-sm">Memuat channels…</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-bright">
              <Radio size={28} />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Belum ada channel</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">Buat channel pertama</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
              Channel WhatsApp memungkinkan broadcast konten ke subscriber.
            </p>
            <button
              onClick={() => { setFormName(""); setFormDesc(""); setCreateOpen(true); }}
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink"
            >
              <Plus size={16} weight="bold" />
              Buat Channel
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <Spotlight
                key={ch.id}
                className="bk-lift rounded-2xl border border-line bg-surface p-5 hover:border-accent/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-surface-2 text-accent-bright">
                    <Radio size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{ch.name}</p>
                    {ch.description && (
                      <p className="mt-0.5 truncate text-xs text-fg-muted">{ch.description}</p>
                    )}
                    {ch.subscriberCount !== undefined && (
                      <p className="mt-1 flex items-center gap-1 font-mono text-xs text-fg-faint">
                        <Users size={12} />
                        {ch.subscriberCount} subscriber
                      </p>
                    )}
                  </div>
                </div>
              </Spotlight>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Channel Baru</p>
                <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">Buat Channel</h2>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="-m-2 flex h-11 w-11 items-center justify-center rounded-xl text-fg-faint hover:bg-surface-2 hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label htmlFor="ch-name" className="mb-1.5 block text-sm font-medium text-fg">Nama Channel</label>
                <input
                  id="ch-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="mis. Tips Harian, Promo Mingguan"
                  maxLength={100}
                  required
                  autoFocus
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="ch-desc" className="mb-1.5 block text-sm font-medium text-fg">Deskripsi (opsional)</label>
                <input
                  id="ch-desc"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Deskripsi singkat tentang channel ini"
                  maxLength={200}
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Membuat…" : "Buat Channel"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
