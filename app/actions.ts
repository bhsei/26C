"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { randomUUID, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import type { Allergen } from "../app/generated/prisma/client";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";
import { sendOrderPlacedNotifications } from "@/lib/notifications";

const PLATFORM_FEE_CENTS = 25;
const SERVICE_FEE_CENTS = 25;

// A supervisor can publish a listing for their dining hall, which students can then claim.
export async function createListing(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;

  const foodId = String(formData.get("foodId") ?? "").trim();
  const originalPriceCents = Number(formData.get("originalPriceCents") ?? 0);
  const discountRate = Number(formData.get("discountRate") ?? 60);
  const quantityTotal = Number(formData.get("quantityTotal") ?? 0);
  const pickupWindowStart = new Date(String(formData.get("pickupWindowStart") ?? ""));
  const pickupWindowEnd = new Date(String(formData.get("pickupWindowEnd") ?? ""));

  if (
    !foodId ||
    !Number.isInteger(originalPriceCents) || originalPriceCents <= 0 ||
    !Number.isInteger(discountRate) || discountRate < 0 || discountRate > 100 ||
    !Number.isInteger(quantityTotal) || quantityTotal <= 0 ||
    Number.isNaN(pickupWindowStart.getTime()) ||
    Number.isNaN(pickupWindowEnd.getTime()) ||
    pickupWindowStart <= new Date() ||
    pickupWindowEnd <= pickupWindowStart
  ) {
    return;
  }

  // Confirm the food exists in the global catalog
  const food = await prisma.food.findUnique({ where: { id: foodId } });
  if (!food) return;

  // Optional: prevent duplicate active listings for the same dish in this hall
  const existing = await prisma.listing.findFirst({
    where: {
      diningHallId: supervisor.diningHallId,
      foodId: food.id,
      status: "ACTIVE",
      pickupWindowEnd: { gt: new Date() },
    },
  });
  if (existing) return;

  await prisma.listing.create({
    data: {
      diningHallId: supervisor.diningHallId,
      createdById: supervisor.id,
      foodId: food.id,
      originalPriceCents,
      priceCents: Math.round((originalPriceCents * (100 - discountRate)) / 100),
      discountRate,
      quantityTotal,
      quantityRemaining: quantityTotal,
      pickupWindowStart,
      pickupWindowEnd,
    },
  });

  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");
}

// A student can claim a listing, which creates an order for that student and decrements the quantity remaining of the listing.
export async function claimListing(formData: FormData) {
  // Although the naming student is used here, actually, supervisors can also claim listings
  const user = await getCurrentUser();
  if (!user) {
    //throw new Error("Not authenticated");
    redirect("/login");
  }
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  const order = await prisma.$transaction(async (tx) => {
    // 1. UPDATED: Include food and supervisor relations so we can send the notification
    const listing = await tx.listing.findFirst({
      where: {
        id: listingId,
        status: "ACTIVE",
        quantityRemaining: { gt: 0 },
        pickupWindowEnd: { gt: new Date() },
      },
      include: {
        food: true,
        diningHall: {
          include: { supervisors: true },
        },
      },
    });
    if (!listing) return null;

    const inventory = await tx.listing.updateMany({
      where: { id: listingId, quantityRemaining: { gte: 1 }, status: "ACTIVE" },
      data: { quantityRemaining: { decrement: 1 } },
    });
    if (!inventory.count) return null;

    // 2. UPDATED: Create notifications when the last item is claimed
    if (listing.quantityRemaining === 1) {
      await tx.listing.update({
        where: { id: listingId },
        data: { status: "SOLD_OUT" },
      });

      // Notify the specific user who created the listing
      if (listing.createdById) {
        await tx.notification.create({
          data: {
            userId: listing.createdById,
            message: `🎉 Great news! Your listing for ${listing.food.name} has completely sold out.`,
            isRead: false,
          },
        });
      } 
      // Fallback: Notify all supervisors of that dining hall if createdById isn't set
      else if (listing.diningHall.supervisors.length > 0) {
        const notificationsToCreate = listing.diningHall.supervisors.map((sup) => ({
          userId: sup.id,
          message: `🎉 Great news! The listing for ${listing.food.name} has completely sold out.`,
          isRead: false,
        }));
        
        await tx.notification.createMany({
          data: notificationsToCreate,
        });
      }
    }

    const paymentRef = `wx_${randomUUID()}`;

    return tx.order.create({
      data: {
        listingId,
        studentId: user.id,
        quantity: 1,
        originalPriceCents: listing.originalPriceCents,
        discountRate: listing.discountRate,
        finalPriceCents: listing.priceCents,
        platformFeeCents: PLATFORM_FEE_CENTS,
        serviceFeeCents: SERVICE_FEE_CENTS,
        pickupWindowStart: listing.pickupWindowStart,
        pickupWindowEnd: listing.pickupWindowEnd,
        paymentRef,
      },
    });
  });

  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");

  if (order) redirect(`/pay/${order.paymentRef}`);
}

// A supervisor can confirm the pickup of an order, which updates the order status to "PICKED_UP" and records the pickup time.
export async function confirmPickup(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const now = new Date();
  await settleUnavailableOrders(now);
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  await prisma.order.updateMany({
    where: {
      id: orderId,
      status: "RESERVED",
      listing: { is: { diningHallId: supervisor.diningHallId, pickupWindowEnd: { gt: now }, status: { notIn: ["EXPIRED", "WITHDRAWN"] } } },
    },
    data: { status: "PICKED_UP", pickedUpAt: now },
  });

  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");
}

// Supervisors can withdraw an unexpired listing; paid reservations are refunded by the settlement step.
export async function withdrawListing(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  const now = new Date();
  await settleUnavailableOrders(now);
  await prisma.listing.updateMany({
    where: { id: listingId, diningHallId: supervisor.diningHallId, status: { in: ["ACTIVE", "SOLD_OUT"] }, pickupWindowEnd: { gt: now } },
    data: { status: "WITHDRAWN", updatedAt: now },
  });
  await settleUnavailableOrders(now);
  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");
}

// A supervisor can switch between the merchant and student pages.
export async function changePage(formData: FormData) {
  await requireRole("SUPERVISOR");

  const from = String(formData.get("from"));
  redirect(from === "/merchant" ? "/orders" : "/merchant");
}

// A pickup code is generated for each order when the student confirms payment.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function generatePickupCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  // Group as XXXX-XXXX-XX for readability
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

// A student can confirm payment for an order, which updates the order status to "RESERVED".
export async function confirmPayment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const now = new Date();
  await settleUnavailableOrders(now);

  const ref = String(formData.get("ref") ?? "");
  if (!ref) return;

  // Atomic + idempotent: only PENDING_PAYMENT → PAID, once.
  const result = await prisma.order.updateMany({
    where: {
      paymentRef: ref,
      studentId: user.id,
      status: "PENDING_PAYMENT",
      listing: { is: { pickupWindowEnd: { gt: now }, status: { notIn: ["EXPIRED", "WITHDRAWN"] } } },
    },
    data: {
      status: "RESERVED",
      paidAt: now,
      updatedAt: now,
      pickupCode: generatePickupCode(),
    },
  });

  if (result.count === 0) {
    // Ref not found, or already paid — either way, nothing to do.
    // The page re-render will show the existing state.
  }

  if (result.count > 0) {
    // Fetch the updated order so we have its ID to trigger notifications
    const confirmedOrder = await prisma.order.findFirst({
      where: { paymentRef: ref }
    });
    
    if (confirmedOrder) {
      // Trigger the notifications now that the order is fully paid and has a pickup code
      await sendOrderPlacedNotifications(confirmedOrder.id);
    }
  }

  revalidatePath(`/pay/${ref}`);
  revalidatePath("/orders");
  revalidatePath("/merchant");
  revalidatePath("/");
}
