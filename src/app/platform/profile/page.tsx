import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { changePassword } from "@/lib/platformChangePassword";
import { FormState } from "@/lib/platformChangePassword";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { PasswordForm } from "@/components/platform/PasswordForm";

export default async function ProfilePage() {
  const session = await auth();
  if (session?.user?.role !== "platform_admin") redirect("/dashboard");

  const email = session.user.email ?? "";
  const name = session.user.name ?? session.user.email ?? "";

  return (
    <PlatformPage title="Profil & Keamanan">
      <PasswordForm initialEmail={email} userName={name} />
    </PlatformPage>
  );
}
