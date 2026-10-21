import prisma from "@/lib/prisma";

/**
 * Expire listings after their pickup window and settle outstanding orders.
 * Paid reservations get a full simulated refund (meal plus both fees); unpaid
 * orders expire without a charge. Withdrawn listings cancel and refund the
 * same way. Conditional updates make concurrent page requests safe.
 */
export async function settleUnavailableOrders(now = new Date()) {
  await prisma.listing.updateMany({
    where: {
      status: { in: ["ACTIVE", "SOLD_OUT"] },
      pickupWindowEnd: { lte: now },
    },
    data: { status: "EXPIRED", updatedAt: now },
  });

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      pickupWindowEnd: { lte: now },
    },
    include: {
      items: { include: { listing: true } },
      payments: true,
    },
  });

  for (const order of orders) {
    const hasPaid = order.payments.some((payment) => payment.status === "PAID");
    const listingStatus = order.items[0]?.listing.status;
    const nextStatus = listingStatus === "CANCELLED" ? "CANCELLED" : "EXPIRED";

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: hasPaid ? "CONFIRMED" : nextStatus,
        updatedAt: now,
      },
    });
  }
}
