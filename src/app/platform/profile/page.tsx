import { auth, redirect } from "@/lib/auth";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { PasswordForm } from "@/components/platform/PasswordForm";

export default async function ProfilePage() {
  const session = await auth();
  if (session?.user?.role !== "platform_admin") redirect("/dashboard");

  const email = session.user.email ?? "";
  const name = session.user.name ?? session.user.email ?? "";

  return (
    <PlatformPage
      title="Profil & Keamanan"
      description="Kelola informasi akun dan ubah password untuk keamanan akses platform."
      action={{ label: "Kembali ke Platform", href: "/platform" }}
    >
      <PasswordForm initialEmail={email} userName={name} />
    </PlatformPage>
  );
}
