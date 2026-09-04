"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Warning,
  CheckCircle,
  UserCircle,
  SpinnerGap,
  Camera,
  Trash,
} from "@phosphor-icons/react";

interface Device {
  id: string;
  label: string;
  status: string;
  phone: string | null;
}

interface Profile {
  name: string;
  about: string;
  phone: string;
}

export default function ProfilePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit state
  const [editName, setEditName] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const [saving, setSaving] = useState(false);

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

  const loadProfile = useCallback(async () => {
    if (!selectedDevice) return;
    setProfileLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/profile`);
      const data = await res.json();
      if (!res.ok) {
        // 501 = engine limitation (Baileys doesn't support profile)
        if (res.status === 501) {
          setProfile(null);
          setError("Fitur profil belum tersedia untuk device ini. Hubungi admin untuk info lebih lanjut.");
          return;
        }
        throw new Error(data.error ?? "Gagal memuat profil");
      }
      setProfile(data.profile);
      setEditName(data.profile.name ?? "");
      setEditAbout(data.profile.about ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProfileLoading(false);
    }
  }, [selectedDevice]);

  useEffect(() => { if (selectedDevice) loadProfile(); }, [selectedDevice, loadProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !selectedDevice) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, about: editAbout }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal update profil");
      setProfile(data.profile);
      setSuccess("Profil berhasil diperbarui!");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Profile</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Profil WhatsApp
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Kelola nama tampilan dan about text untuk akun WhatsApp.
        </p>
      </div>

      {error && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {error}
        </p>
      )}

      {success && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle size={16} className="mt-0.5 shrink-0" weight="fill" />
          {success}
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
              <option key={d.id} value={d.id}>
                {d.label}{d.phone ? ` (${d.phone})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />
            <div className="mt-4 h-12 animate-pulse rounded-xl bg-surface-2" />
            <div className="mt-4 h-12 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-bright">
              <UserCircle size={28} />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Belum ada device</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">Hubungkan device dulu</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
              Hubungkan nomor WhatsApp ke Wavio untuk mengatur profil.
            </p>
          </div>
        ) : profileLoading ? (
          <div className="flex items-center gap-3 text-fg-muted">
            <SpinnerGap size={20} className="animate-spin text-accent" />
            <span className="text-sm">Memuat profil…</span>
          </div>
        ) : profile ? (
          <div className="rounded-2xl border border-line bg-surface p-6">
            {/* Current profile info */}
            <div className="flex items-center gap-4 rounded-xl border border-line-soft bg-ink-2 p-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 font-display text-xl font-semibold text-accent-bright">
                {(profile.name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-medium text-fg">{profile.name || "(tidak ada nama)"}</p>
                <p className="mt-0.5 truncate text-sm text-fg-muted">{profile.about || "(tidak ada about)"}</p>
                {profile.phone && (
                  <p className="bk-tabular mt-1 font-mono text-xs text-fg-faint">{profile.phone}</p>
                )}
              </div>
            </div>

            {/* Edit form */}
            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div>
                <label htmlFor="prof-name" className="mb-1.5 block text-sm font-medium text-fg">Nama Tampilan</label>
                <input
                  id="prof-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama yang ditampilkan di WhatsApp"
                  maxLength={50}
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="prof-about" className="mb-1.5 block text-sm font-medium text-fg">About</label>
                <input
                  id="prof-about"
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  placeholder="Teks about / status"
                  maxLength={140}
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99] disabled:opacity-50"
              >
                {saving ? "Menyimpan…" : "Simpan Profil"}
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-3xl border border-line bg-surface px-6 py-12 text-center">
            <p className="text-sm text-fg-muted">Gagal memuat profil. Coba pilih device lain.</p>
          </div>
        )}
      </div>
    </div>
  );
}
