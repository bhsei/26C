import Link from "next/link";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { confirmPayment } from "@/app/actions";
import { FakeQR } from "@/app/components/FakeQR";

export default async function PayPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const order = await prisma.order.findUnique({
    where: { paymentRef: ref },
    include: { listing: true },
  });
  if (!order) notFound();

  if (order.status === "RESERVED" || order.status === "PICKED_UP") {
    return (
      <main className="min-h-screen bg-white p-8 text-blue-600">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">Already paid</h1>
          <p className="mt-2 text-sm">
            Show this code at the pickup counter
          </p>
          <p className="mt-6 font-mono text-3xl tracking-widest">
            {order.pickupCode}
          </p>
          <Link
            href="/student"
            className="mt-8 inline-block rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Back to listings
          </Link>
        </div>
      </main>
    );
  }

  const total =
    (order.finalPriceCents + order.platformFeeCents + order.serviceFeeCents) / 100;

  return (
    <main className="min-h-screen bg-white p-8 text-blue-600">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">WeChat Pay (simulation)</h1>
        <p className="mt-1 text-sm">{order.listing.title}</p>
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
    </main>
  );
}