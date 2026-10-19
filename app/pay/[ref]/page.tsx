import Link from "next/link";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { confirmPayment } from "@/app/actions";
import { FakeQR } from "@/app/components/FakeQR";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/app/components/DashboardShell";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";

export default async function PayPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forders");
  await settleUnavailableOrders();
  const order = await prisma.order.findUnique({
    where: { paymentRef: ref },
    include: { listing: { include: { food: true } } },
  });
  if (!order) notFound();

  if (order.status === "EXPIRED" || order.status === "CANCELLED") {
    return (
      <DashboardShell user={user} active="orders"><div className="pay-content">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">{order.status === "EXPIRED" ? "Meal expired" : "Reservation canceled"}</h1>
          <p className="mt-2 text-sm">{order.refundedAt ? `A simulated refund of $${((order.refundAmountCents ?? 0) / 100).toFixed(2)} has been recorded for your order.` : "Payment was not completed, so no charge was made."}</p>
          <Link
            href="/orders"
            className="mt-8 inline-block rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Back to listings
          </Link>
        </div>
      </div></DashboardShell>
    );
  }

  if (order.status === "PICKED_UP") {
    return <DashboardShell user={user} active="orders"><div className="pay-content"><div className="mx-auto max-w-md text-center"><h1 className="text-2xl font-bold">Order picked up</h1><p className="mt-2 text-sm">This meal has already been collected. Thanks for helping reduce food waste.</p><Link href="/orders" className="mt-8 inline-block rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700">Back to reserve orders</Link></div></div></DashboardShell>;
  }

  if (order.status === "RESERVED") {
    return (
      <DashboardShell user={user} active="orders"><div className="pay-content">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">Payment complete</h1>
          <p className="mt-2 text-sm">Show this pickup code at the counter before the pickup window ends.</p>
          <p className="mt-6 font-mono text-3xl tracking-widest">{order.pickupCode ?? "Pickup code pending"}</p>
          <Link href="/orders" className="mt-8 inline-block rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700">Back to reserve orders</Link>
        </div>
      </div></DashboardShell>
    );
  }

  const total =
    (order.finalPriceCents * order.quantity + order.platformFeeCents + order.serviceFeeCents) / 100;

  return (
    <DashboardShell user={user} active="orders"><div className="pay-content">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">WeChat Pay (simulation)</h1>
        <p className="mt-1 text-sm">{order.listing.food.name}</p>
        <p className="mt-4 text-3xl font-bold">¥{total.toFixed(2)}</p>

        <div className="mt-6 flex justify-center">
          <FakeQR
            seed={order.paymentRef}
            size={240}
            className="rounded border border-gray-200"
          />
        </div>

        <p className="mt-3 text-xs">Scan with WeChat to pay</p>

        <form action={confirmPayment} className="mt-6">
          <input type="hidden" name="ref" value={order.paymentRef} />
          <button className="rounded bg-green-600 px-6 py-2 text-white hover:bg-green-700">
            Scan &amp; Pay (Simulation)
          </button>
        </form>
      </div>
    </div></DashboardShell>
  );
}
