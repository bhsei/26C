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
    // 1. UPDATED: Fetch the required notification data alongside the financial data
    select: {
      id: true,
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

    // 2. NEW: Generate and dispatch notifications if it was a confirmed reservation
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
