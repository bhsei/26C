import prisma from "@/lib/prisma";

export async function sendOrderPlacedNotifications(orderId: string) {
  // Fetch the order with needed relations
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: {
        include: {
          food: true,
          diningHall: true,
          createdBy: true,
        }
      },
    },
  });

  if (!order) return;

  const pickupStart = order.pickupWindowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const pickupEnd = order.pickupWindowEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. Notification for the Student
  await prisma.notification.create({
    data: {
      userId: order.studentId,
      message: `Your reservation for ${order.listing.food.name} is confirmed! Pick it up at ${order.listing.diningHall.name} between ${pickupStart} and ${pickupEnd}.`,
    },
  });

  // 2. Notification for the Merchant (Supervisor who created the listing)
  if (order.listing.createdById) {
    await prisma.notification.create({
      data: {
        userId: order.listing.createdById,
        message: `New order placed for ${order.listing.food.name}. Match pickup code: ${order.pickupCode}.`,
      },
    });
  }
}