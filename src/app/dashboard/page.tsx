import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenantDashboardOverview } from "@/lib/dashboard";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export default async function DashboardHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/login");

  const data = await getTenantDashboardOverview(tenantId);
  const name = session.user.name ?? session.user.email ?? "Pengguna";

  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <DashboardOverview
      data={data}
      userName={name}
      formattedDate={date}
      greetingText={greeting()}
    />
  );
}
