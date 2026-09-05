import { listPlatformOrders } from "@/lib/platform";
import { OrdersTable } from "@/components/platform/OrdersTable";

export default async function PlatformOrders() {
  const orders = await listPlatformOrders();
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Platform</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Orders
      </h1>
      <p className="mt-2 max-w-[60ch] text-sm text-fg-muted">
        Semua order pembayaran (paket pertama, perpanjangan, add-on, top-up). Gunakan
        <b>Resync Tripay</b> bila status belum ter-update dari callback, atau <b>Tandai lunas</b>
        utk rekonsiliasi manual (pembayaran di luar gateway / Tripay sedang down).
      </p>
      <div className="mt-8">
        <OrdersTable initial={orders} />
      </div>
    </div>
  );
}