"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { queryD1One, changesD1 } from "@/lib/d1";
import bcrypt from "bcryptjs";

export type FormState =
  | { ok: true; message: string; error?: never }
  | { ok: false; error: string; message?: never };

export async function changePassword(
  prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (session?.user?.role !== "platform_admin") {
    return { ok: false, error: "Unauthorized" };
  }

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, error: "Semua field wajib diisi." };
  }

  if (newPassword.length < 8) {
    return { ok: false, error: "Password baru minimal 8 karakter." };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Password baru dan konfirmasi tidak cocok." };
  }

  const user = await queryD1One<{
    id: string;
    passwordHash: string;
  }>("SELECT id, passwordHash FROM \"User\" WHERE email = ?", [session.user.email]);

  if (!user) {
    return { ok: false, error: "Akun tidak ditemukan." };
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return { ok: false, error: "Password saat ini salah." };
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  await changesD1("UPDATE \"User\" SET \"passwordHash\" = ? WHERE id = ?", [
    newHash,
    user.id,
  ]);

  revalidatePath("/platform");
  revalidatePath("/platform/profile");

  return { ok: true, message: "Password berhasil diubah." };
}
