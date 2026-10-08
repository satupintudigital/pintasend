import { auth } from "@/lib/auth";
import {
  forbidden,
  isPlatformAdmin,
  parsePrincipal,
  unauthorized,
  type SessionLike,
} from "@/lib/abac";
import { listPlatformOrders } from "@/lib/platform";

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(_req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  try {
    const orders = await listPlatformOrders(undefined, 5000);

    const headers = [
      "ID Order",
      "ID Tenant",
      "Nama Tenant",
      "Jenis",
      "Status",
      "Jumlah (Rp)",
      "Metode Bayar",
      "Dibuat Pada",
      "Dibayar Pada",
      "Kedaluwarsa Pada",
    ];

    const rows = orders.map((o) => [
      o.id,
      o.tenantId,
      o.tenantName,
      o.kind,
      o.status,
      o.amount,
      o.payMethod ?? "",
      o.createdAt,
      o.paidAt ?? "",
      o.expiresAt ?? "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCsvField).join(",")),
    ].join("\r\n");

    const today = new Date().toISOString().slice(0, 10);
    const filename = `pintasend-orders-${today}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("platform/orders export:", e);
    return Response.json({ error: "Gagal mengekspor order CSV" }, { status: 500 });
  }
}
