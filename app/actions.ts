"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { randomUUID, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";
import { sendOrderPlacedNotifications } from "@/lib/notifications";
import { buildRescueRouteInput, evaluateRescueRoute, isListingOpen, isRescueCandidate } from "@/lib/rescue-routing";
import { RESCUE_EVENT, getDispatchLink, hasOpenRescueDispatch, loadRescueDestinations, type RescueCreatedMetadata } from "@/lib/rescue-dispatch";
import type { RescueDispatchStatus } from "@/app/generated/prisma/client";

const PLATFORM_FEE_CENTS = 25;
const SERVICE_FEE_CENTS = 25;
const PAYMENT_HOLD_MS = 10 * 60 * 1000;

// A supervisor can publish a listing for their dining hall, which students can then claim.
export async function createListing(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;

  const foodId = String(formData.get("foodId") ?? "").trim();
  const originalPriceCents = Number(formData.get("originalPriceCents") ?? 0);
  const discountRate = Number(formData.get("discountRate") ?? 60);
  const autoPricingEnabled = formData.get("autoPricingEnabled") === "on";
  const quantityTotal = Number(formData.get("quantityTotal") ?? 0);
  const pickupWindowStart = new Date(String(formData.get("pickupWindowStart") ?? ""));
  const pickupWindowEnd = new Date(String(formData.get("pickupWindowEnd") ?? ""));

  if (
    !foodId ||
    !Number.isInteger(originalPriceCents) || originalPriceCents <= 0 ||
    !Number.isInteger(discountRate) || discountRate < 0 || discountRate > 100 ||
    (autoPricingEnabled && discountRate > 80) ||
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
      autoPricingEnabled,
      lastAutoPriceReviewAt: null,
      lastAutoPriceReason: autoPricingEnabled ? 'Automatic discount enabled; waiting for the first review.' : null,
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
  const user = await requireRole("STUDENT");
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  const now = new Date();
  await settleUnavailableOrders(now);

  const order = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    const openOrderCount = await tx.order.count({
      where: { studentId: user.id, listingId, status: { in: ["PENDING_PAYMENT", "RESERVED"] } },
    });
    if (openOrderCount >= 2) return null;
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
  const pickupCode = String(formData.get("pickupCode") ?? "").trim().toUpperCase();
  if (!orderId || !pickupCode) return;

  // 1. Find the order first so we know who to notify and what the food is
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      pickupCode,
      status: "RESERVED",
      listing: { 
        is: { 
          diningHallId: supervisor.diningHallId, 
          pickupWindowEnd: { gt: now }, 
          status: { notIn: ["EXPIRED", "WITHDRAWN"] } 
        } 
      },
    },
    include: {
      listing: {
        include: { food: true }
      }
    }
  });

  if (!order) return; // Order not found or not eligible for pickup

  // 2. Update the order status
  const transitioned = await prisma.order.updateMany({
    where: { id: order.id, status: "RESERVED", pickupCode, pickupWindowEnd: { gt: now } },
    data: { status: "PICKED_UP", pickedUpAt: now },
  });
  if (transitioned.count !== 1) return;

  // 3. Format the time (e.g., "02:30 PM")
  const timeString = now.toLocaleTimeString("en-US", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });

  // 4. Send the success notification to the student
  await prisma.notification.create({
    data: {
      userId: order.studentId,
      message: `Success! Your order for ${order.listing.food.name} was successfully picked up at ${timeString}. Enjoy your meal!`,
    },
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
      createdAt: { gt: new Date(now.getTime() - PAYMENT_HOLD_MS) },
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
    // Include the nested food details so we can use the name
    const confirmedOrder = await prisma.order.findFirst({
      where: { paymentRef: ref },
      include: {
        listing: {
          include: { food: true }
        }
      }
    });
    
    if (confirmedOrder) {
      // Trigger merchant notifications (if you have them)
      await sendOrderPlacedNotifications(confirmedOrder.id);

      const now = new Date();
      
      // CHECK: Is the pickup window already open right now?
      if (confirmedOrder.pickupWindowStart <= now && confirmedOrder.pickupWindowEnd > now) {
        // Send the notification immediately
        await prisma.notification.create({
          data: {
            userId: confirmedOrder.studentId,
            message: `Ready for pickup! Your window for ${confirmedOrder.listing.food.name} is open right now. Head over and show your pickup code: ${confirmedOrder.pickupCode}.`,
          }
        });

        // Mark it as sent so the cron job completely ignores it
        await prisma.order.update({
          where: { id: confirmedOrder.id },
          data: { reminderOpenSent: true }
        });
      }
    }
  }

  revalidatePath(`/pay/${ref}`);
  revalidatePath("/orders");
  revalidatePath("/merchant");
  revalidatePath("/");
}

// RESCUE ROUTING ACTIONS (REQ-FUNC-024)

function revalidateRescueViews() {
  revalidatePath("/merchant");
  revalidatePath("/");
}

// Evaluate the rescue route for a listing and record it as a dispatch.
// Routes that need approval are saved as PLANNED; the rest go straight to DISPATCHED.
export async function recommendRescueRoute(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const diningHallId = supervisor.diningHallId;

  const listingId = String(formData.get("listingId") ?? "").trim();
  if (!listingId) return;
  const now = new Date();
  await settleUnavailableOrders(now);

  await prisma.$transaction(async (tx) => {
    // Lock the listing so two clicks cannot create two dispatches or race a student claim.
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    const listing = await tx.listing.findFirst({
      where: { id: listingId, diningHallId },
      include: { food: true, orders: { select: { status: true, quantity: true } } },
    });
    if (!listing || !isRescueCandidate(listing, now)) return;
    if (await hasOpenRescueDispatch(tx, listing.id)) return;

    const destinations = await loadRescueDestinations(tx, now);
    const input = buildRescueRouteInput(listing, destinations, now);
    const recommendation = evaluateRescueRoute(input);
    const target = recommendation.recommendedDestination ?? recommendation.fallbackDestination;

    if (!target) {
      await tx.listingEvent.create({
        data: {
          listingId: listing.id,
          eventType: RESCUE_EVENT.NO_DESTINATION,
          metadata: {
            units: input.quantityRemaining,
            estimatedKg: recommendation.estimatedKg,
            reason: recommendation.reason,
            explanation: recommendation.explanation,
            requestedBy: supervisor.id,
          },
        },
      });
      return;
    }

    const dispatchStatus = recommendation.requiresApproval ? "PLANNED" : "DISPATCHED";
    const usedFallback = !recommendation.recommendedDestination;
    const dispatch = await tx.rescueDispatch.create({
      data: {
        diningHallId,
        destinationId: target.id,
        category: listing.food.category,
        dispatchedAt: now,
        kgRedistributed: Math.round(recommendation.estimatedKg * 100) / 100,
        status: dispatchStatus,
        notes: `${input.quantityRemaining} × ${listing.food.name}. ${recommendation.reason} ${recommendation.explanation}`,
      },
    });

    // Units routed from a listing that is still on sale leave the marketplace.
    let unitsWithdrawnFromSale = 0;
    if (isListingOpen(listing, now) && listing.quantityRemaining > 0) {
      unitsWithdrawnFromSale = listing.quantityRemaining;
      await tx.listing.update({ where: { id: listing.id }, data: { quantityRemaining: 0, status: "SOLD_OUT" } });
    }

    const metadata: RescueCreatedMetadata = {
      dispatchId: dispatch.id,
      destinationId: target.id,
      destinationName: target.name,
      units: input.quantityRemaining,
      unitsWithdrawnFromSale,
      estimatedKg: recommendation.estimatedKg,
      dispatchStatus,
      recommendationStatus: recommendation.status,
      usedFallback,
      requiresApproval: recommendation.requiresApproval,
      reason: recommendation.reason,
      explanation: recommendation.explanation,
      candidateDestinationIds: recommendation.candidateDestinations.map((d) => d.id),
    };
    await tx.listingEvent.create({ data: { listingId: listing.id, eventType: RESCUE_EVENT.CREATED, metadata } });
  });

  revalidateRescueViews();
}

// Load a dispatch of the supervisor's hall that is in one of the allowed states.
async function findHallDispatch(dispatchId: string, diningHallId: string, statuses: RescueDispatchStatus[]) {
  if (!dispatchId) return null;
  return prisma.rescueDispatch.findFirst({ where: { id: dispatchId, diningHallId, status: { in: statuses } } });
}

// Approve a PLANNED rescue dispatch.
export async function approveRescueRoute(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const dispatch = await findHallDispatch(String(formData.get("dispatchId") ?? "").trim(), supervisor.diningHallId, ["PLANNED"]);
  if (!dispatch) return;

  const approver = supervisor.name ?? supervisor.email;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.rescueDispatch.updateMany({
      where: { id: dispatch.id, status: "PLANNED" },
      data: { status: "DISPATCHED", dispatchedAt: new Date(), notes: `${dispatch.notes ?? ""} Approved by ${approver}.`.trim() },
    });
    if (!updated.count) return;
    const link = await getDispatchLink(tx, dispatch.id);
    if (link) {
      await tx.listingEvent.create({
        data: { listingId: link.listingId, eventType: RESCUE_EVENT.APPROVED, metadata: { dispatchId: dispatch.id, approvedBy: supervisor.id } },
      });
    }
  });

  revalidateRescueViews();
}

// Record the final disposition: the food reached the destination.
export async function completeRescueRoute(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const dispatch = await findHallDispatch(String(formData.get("dispatchId") ?? "").trim(), supervisor.diningHallId, ["DISPATCHED"]);
  if (!dispatch) return;

  const deliveredRaw = String(formData.get("deliveredKg") ?? "").trim();
  const deliveredKg = deliveredRaw === "" ? dispatch.kgRedistributed : Number(deliveredRaw);
  if (deliveredKg != null && (!Number.isFinite(deliveredKg) || deliveredKg < 0)) return;

  const who = supervisor.name ?? supervisor.email;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.rescueDispatch.updateMany({
      where: { id: dispatch.id, status: "DISPATCHED" },
      data: {
        status: "COMPLETED",
        kgRedistributed: deliveredKg,
        notes: `${dispatch.notes ?? ""} Delivery confirmed by ${who}${deliveredKg != null ? ` (${deliveredKg} kg)` : ""}.`.trim(),
      },
    });
    if (!updated.count) return;
    const link = await getDispatchLink(tx, dispatch.id);
    if (link) {
      await tx.listingEvent.create({
        data: { listingId: link.listingId, eventType: RESCUE_EVENT.COMPLETED, metadata: { dispatchId: dispatch.id, deliveredKg, confirmedBy: supervisor.id } },
      });
    }
  });

  revalidateRescueViews();
}

// Reject a PLANNED route or cancel a DISPATCHED one. Units taken off sale go back
// to the marketplace if the pickup window is still open.
export async function cancelRescueRoute(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const dispatch = await findHallDispatch(String(formData.get("dispatchId") ?? "").trim(), supervisor.diningHallId, ["PLANNED", "DISPATCHED"]);
  if (!dispatch) return;

  const now = new Date();
  const who = supervisor.name ?? supervisor.email;
  const verb = dispatch.status === "PLANNED" ? "Rejected" : "Cancelled";
  await prisma.$transaction(async (tx) => {
    const updated = await tx.rescueDispatch.updateMany({
      where: { id: dispatch.id, status: dispatch.status },
      data: { status: "CANCELLED", notes: `${dispatch.notes ?? ""} ${verb} by ${who}.`.trim() },
    });
    if (!updated.count) return;

    const link = await getDispatchLink(tx, dispatch.id);
    if (!link) return;

    let unitsRestored = 0;
    if (link.created.unitsWithdrawnFromSale > 0) {
      const restored = await tx.listing.updateMany({
        where: { id: link.listingId, status: { in: ["ACTIVE", "SOLD_OUT"] }, pickupWindowEnd: { gt: now } },
        data: { quantityRemaining: { increment: link.created.unitsWithdrawnFromSale }, status: "ACTIVE" },
      });
      if (restored.count) unitsRestored = link.created.unitsWithdrawnFromSale;
    }

    await tx.listingEvent.create({
      data: {
        listingId: link.listingId,
        eventType: RESCUE_EVENT.CANCELLED,
        metadata: { dispatchId: dispatch.id, previousStatus: dispatch.status, unitsRestored, cancelledBy: supervisor.id },
      },
    });
  });

  revalidateRescueViews();
}
