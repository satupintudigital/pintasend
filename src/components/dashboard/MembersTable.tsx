"use client";

import { useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  SpinnerGap,
  Trash,
  UserPlus,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";

export interface Member {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "owner" | "tenant_admin" | "member" | "platform_admin";
  createdAt: string;
}

const ROLE_LABEL: Record<Member["role"], string> = {
  owner: "Owner",
  tenant_admin: "Tenant Admin",
  member: "Member",
  platform_admin: "Platform Admin",
};

interface Props {
  initial: Member[];
  currentUserId: string;
  currentRole: Member["role"];
}

export function MembersTable({ initial, currentUserId, currentRole }: Props) {
  const [members, setMembers] = useState<Member[]>(initial);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form invite
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "tenant_admin">("member");
  const [inviting, setInviting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const flash = (err: string, ok = "") => {
    setError(err);
    setSuccess(ok);
  };

  async function refresh() {
    try {
      const res = await fetch("/api/admin/users?page=1&limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat members");
      setMembers(data.users ?? []);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Gagal memuat members");
    }
  }


  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    flash("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mengundang");
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      setShowForm(false);
      flash("", "Member berhasil diundang.");
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Gagal mengundang member");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(m: Member, next: "member" | "tenant_admin") {
    flash("");
    try {
      const res = await fetch(`/api/admin/users/${m.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah peran");
      flash("", `Peran ${m.name} diubah ke ${ROLE_LABEL[next]}.`);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Gagal mengubah peran");
    }
  }

  async function resetPassword(m: Member) {
    const next = window.prompt(`Password baru untuk ${m.email} (min. 8 karakter):`);
    if (!next) return;
    flash("");
    try {
      const res = await fetch(`/api/admin/users/${m.id}/password`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mereset password");
      flash("", `Password ${m.email} berhasil direset.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Gagal mereset password");
    }
  }

  async function remove(m: Member) {
    if (!window.confirm(`Hapus ${m.name} (${m.email}) dari tenant ini?`)) return;
    flash("");
    try {
      const res = await fetch(`/api/admin/users/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menghapus");
      flash("", `${m.name} dihapus dari tenant.`);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Gagal menghapus member");
    }
  }

  const canEdit = currentRole !== "member";

  return (
    <div className="space-y-5">
      {error && (
        <p className="bk-shake flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          <CheckCircle size={16} className="shrink-0" weight="fill" />
          {success}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {members.length} pengguna di tenant ini.
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
          >
            <UserPlus size={15} weight="bold" />
            Undang Member
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleInvite}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
            Undang pengguna baru
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap"
              required
              maxLength={60}
              className="h-11 rounded-xl border border-line bg-surface-2 px-3.5 text-sm outline-none focus:border-accent/50"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="h-11 rounded-xl border border-line bg-surface-2 px-3.5 text-sm outline-none focus:border-accent/50"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password awal (min. 8 karakter)"
              required
              minLength={8}
              maxLength={128}
              className="h-11 rounded-xl border border-line bg-surface-2 px-3.5 text-sm outline-none focus:border-accent/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "tenant_admin")}
              className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent/50"
            >
              <option value="member">Member</option>
              {currentRole === "owner" && (
                <option value="tenant_admin">Tenant Admin</option>
              )}
            </select>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright disabled:opacity-60"
            >
              {inviting ? <SpinnerGap size={15} className="animate-spin" /> : <UserPlus size={15} weight="bold" />}
              Undang
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {members.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <UsersThree size={28} className="text-fg-faint" />
            <p className="text-sm text-fg-muted">Belum ada member lain di tenant ini.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-[11px] uppercase tracking-wider text-fg-faint">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Peran</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {members.map((m) => {
                const isSelf = m.id === currentUserId;
                const editable = canEdit && !isSelf && m.role !== "owner" && m.role !== "platform_admin";
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium">
                      {m.name}
                      {isSelf && (
                        <span className="ml-2 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-bright">
                          Anda
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{m.email}</td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m, e.target.value as "member" | "tenant_admin")}
                          className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs outline-none focus:border-accent/50"
                        >
                          <option value="member">Member</option>
                          {(currentRole === "owner" || m.role === "tenant_admin") && (
                            <option value="tenant_admin">Tenant Admin</option>
                          )}
                        </select>
                      ) : (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                            m.role === "owner"
                              ? "border-accent/25 bg-accent/10 text-accent-bright"
                              : m.role === "tenant_admin"
                                ? "border-violet-200 bg-violet-50 text-violet-700"
                                : "border-line bg-surface-2 text-fg-muted"
                          }`}
                        >
                          {ROLE_LABEL[m.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {editable && (
                          <>
                            <button
                              type="button"
                              title="Reset password"
                              aria-label={`Reset password ${m.email}`}
                              onClick={() => resetPassword(m)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                            >
                              <ArrowClockwise size={15} />
                            </button>
                            <button
                              type="button"
                              title="Hapus member"
                              aria-label={`Hapus ${m.email}`}
                              onClick={() => remove(m)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
