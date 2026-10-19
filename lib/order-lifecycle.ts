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

  const outstanding = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING_PAYMENT", "RESERVED"] },
      listing: {
        is: {
          OR: [
            { status: { in: ["EXPIRED", "WITHDRAWN"] } },
            { pickupWindowEnd: { lte: now } },
          ],
        },
      },
    },
    select: {
      id: true,
      status: true,
      finalPriceCents: true,
      quantity: true,
      platformFeeCents: true,
      serviceFeeCents: true,
      listing: { select: { status: true } },
    },
  });

  for (const order of outstanding) {
    const paid = order.status === "RESERVED";
    const withdrawn = order.listing.status === "WITHDRAWN";
    const refundAmountCents = paid
      ? order.finalPriceCents * order.quantity + order.platformFeeCents + order.serviceFeeCents
      : 0;
    await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: withdrawn ? "CANCELLED" : "EXPIRED",
        refundAmountCents,
        refundedAt: paid ? now : null,
        updatedAt: now,
      },
    });
  }
}
