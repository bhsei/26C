import prisma from "@/lib/prisma";

/**
 * Expire listings after their pickup window and settle outstanding orders.
 * Paid reservations get a full simulated refund (meal plus both fees); unpaid
 * orders expire without a charge. Withdrawn listings cancel and refund the
 * same way. Conditional updates make concurrent page requests safe.
 */
export async function settleUnavailableOrders(now = new Date()) {
  const paymentHoldCutoff = new Date(now.getTime() - 10 * 60 * 1000);
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
      OR: [
        { status: "PENDING_PAYMENT", createdAt: { lte: paymentHoldCutoff } },
        { listing: { is: { OR: [{ status: { in: ["EXPIRED", "WITHDRAWN"] } }, { pickupWindowEnd: { lte: now } }] } } },
      ],
    },
    // 1. UPDATED: Fetch the required notification data alongside the financial data
    select: {
      id: true,
      listingId: true,
      createdAt: true,
      status: true,
      finalPriceCents: true,
      quantity: true,
      platformFeeCents: true,
      serviceFeeCents: true,
      studentId: true,
      pickupCode: true,
      listing: {
        select: {
          status: true,
          food: { select: { name: true } },
          diningHall: { select: { supervisors: { select: { id: true } } } },
        },
      },
    },
  });

  for (const order of outstanding) {
    const paid = order.status === "RESERVED";
    const withdrawn = order.listing.status === "WITHDRAWN";
    const holdExpired = !paid && !withdrawn && order.createdAt <= paymentHoldCutoff && order.listing.status !== "EXPIRED";
    const refundAmountCents = paid
      ? order.finalPriceCents * order.quantity + order.platformFeeCents + order.serviceFeeCents
      : 0;

    const transitioned = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: order.id, status: order.status, ...(holdExpired ? { createdAt: { lte: paymentHoldCutoff } } : {}) },
        data: { status: withdrawn ? "CANCELLED" : "EXPIRED", refundAmountCents, refundedAt: paid ? now : null, updatedAt: now },
      });
      if (result.count !== 1) return false;
      if (holdExpired) {
        await tx.listing.updateMany({
          where: { id: order.listingId, status: { in: ["ACTIVE", "SOLD_OUT"] } },
          data: { quantityRemaining: { increment: order.quantity }, status: "ACTIVE", updatedAt: now },
        });
      }
      return true;
    });
    if (!transitioned) continue;

    // Notify only after the conditional transition succeeds.
    if (paid) {
      const notifications = [];
      const foodName = order.listing.food.name;

      if (withdrawn) {
        // Scenario A: The Merchant withdrew the listing
        notifications.push({
          userId: order.studentId,
          message: `Your order for ${foodName} was cancelled and refunded because the listing was withdrawn.`,
        });
        for (const supervisor of order.listing.diningHall.supervisors) {
          notifications.push({
            userId: supervisor.id,
            message: `An order for ${foodName} (Code: ${order.pickupCode}) was cancelled because the listing was withdrawn.`,
          });
        }
      } else {
        // Scenario B: The user missed the pickup window
        notifications.push({
          userId: order.studentId,
          message: `You missed your pickup window for ${foodName}. The order has expired.`,
        });
        for (const supervisor of order.listing.diningHall.supervisors) {
          notifications.push({
            userId: supervisor.id,
            message: `An order for ${foodName} (Code: ${order.pickupCode}) has expired without being picked up.`,
          });
        }
      }

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications,
        });
      }
    }
  }
}
