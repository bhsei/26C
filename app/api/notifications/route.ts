import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const tenMinsFromNow = new Date(now.getTime() + 10 * 60 * 1000);
  const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);

  // 1. Find orders opening SOON (in the next 10 minutes)
  const openingSoonOrders = await prisma.order.findMany({
    where: {
      status: "RESERVED",
      reminderOpenSent: false,
      pickupWindowStart: { gt: now, lte: tenMinsFromNow },
    },
    include: { listing: { include: { food: true } } },
  });

  for (const order of openingSoonOrders) {
    await prisma.notification.create({
      data: {
        userId: order.studentId,
        message: `Get ready! Your pickup window for ${order.listing.food.name} opens in 10 minutes. Your pickup code is: ${order.pickupCode}.`,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { reminderOpenSent: true },
    });
  }

  // 2. Find orders where the window is ALREADY OPEN
  const alreadyOpenOrders = await prisma.order.findMany({
    where: {
      status: "RESERVED",
      reminderOpenSent: false,
      pickupWindowStart: { lte: now },
      pickupWindowEnd: { gt: now },
    },
    include: { listing: { include: { food: true } } },
  });

  for (const order of alreadyOpenOrders) {
    // REMOVED the createdAt check. If they are in this list, they need to know the window is open.
    await prisma.notification.create({
      data: {
        userId: order.studentId,
        message: `Ready for pickup! Your window for ${order.listing.food.name} is open right now. Head over and show your pickup code: ${order.pickupCode}.`,
      },
    });
    
    await prisma.order.update({
      where: { id: order.id },
      data: { reminderOpenSent: true },
    });
  }

  // 3. Find orders closing in 30 minutes or less
  const closingSoonOrders = await prisma.order.findMany({
    where: {
      status: "RESERVED", 
      reminderCloseSent: false,
      pickupWindowEnd: { gt: now, lte: thirtyMinsFromNow },
    },
    include: { listing: { include: { food: true } } },
  });

  for (const order of closingSoonOrders) {
    await prisma.notification.create({
      data: {
        userId: order.studentId,
        message: `Warning: Your pickup window for ${order.listing.food.name} closes in 30 minutes! Please pick up your order. Don't forget to show your pickup code: ${order.pickupCode}.`,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { reminderCloseSent: true },
    });
  }

  return NextResponse.json({ 
    success: true, 
    openingRemindersSent: openingSoonOrders.length, 
    alreadyOpenRemindersSent: alreadyOpenOrders.length, 
    closingRemindersSent: closingSoonOrders.length 
  });
}