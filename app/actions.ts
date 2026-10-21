"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { randomUUID, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";

const PLATFORM_FEE_CENTS = 25;
const SERVICE_FEE_CENTS = 25;

// A supervisor can publish a listing for their dining hall, which students can then claim.
export async function createListing(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  const membership = await prisma.diningHallMember.findFirst({
    where: { userId: supervisor.id, relation: { in: ["OWNER", "SUPERVISOR"] } },
    select: { diningHallId: true },
  });
  if (!membership) return;

  const foodItemId = String(formData.get("foodId") ?? "").trim();
  const originalPriceCents = Number(formData.get("originalPriceCents") ?? 0);
  const discountRate = Number(formData.get("discountRate") ?? 60);
  const quantityTotal = Number(formData.get("quantityTotal") ?? 0);
  const pickupWindowStart = new Date(String(formData.get("pickupWindowStart") ?? ""));
  const pickupWindowEnd = new Date(String(formData.get("pickupWindowEnd") ?? ""));

  if (
    !foodItemId ||
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

  const foodItem = await prisma.foodItem.findUnique({ where: { id: foodItemId } });
  if (!foodItem || foodItem.diningHallId !== membership.diningHallId) return;

  await prisma.listing.create({
    data: {
      diningHallId: membership.diningHallId,
      createdById: supervisor.id,
      foodItemId: foodItem.id,
      title: foodItem.name,
      description: `Prepared in ${foodItem.category ?? "dining hall"}`,
      category: foodItem.category,
      unitWeightGrams: foodItem.unitWeightGrams,
      originalPriceCents,
      priceCents: Math.round((originalPriceCents * (100 - discountRate)) / 100),
      discountRate: discountRate / 100,
      quantityTotal,
      quantityRemaining: quantityTotal,
      pickupWindowStart,
      pickupWindowEnd,
      status: "ACTIVE",
    },
  });

  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");
}

// A student can claim a listing, which creates an order for that student and decrements the quantity remaining of the listing.
export async function claimListing(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  const listing = await prisma.listing.findFirst({
    where: { id: listingId, status: "ACTIVE", quantityRemaining: { gt: 0 }, pickupWindowEnd: { gt: new Date() } },
  });
  if (!listing) return;

  const paymentRef = `wx_${randomUUID()}`;
  const pickupCode = generatePickupCode();

  const order = await prisma.$transaction(async (tx) => {
    const updatedListing = await tx.listing.update({
      where: { id: listing.id },
      data: { quantityRemaining: { decrement: 1 }, status: listing.quantityRemaining === 1 ? "SOLD_OUT" : "ACTIVE" },
    });

    return tx.order.create({
      data: {
        studentId: user.id,
        diningHallId: updatedListing.diningHallId,
        platformFeeCents: PLATFORM_FEE_CENTS,
        serviceFeeCents: SERVICE_FEE_CENTS,
        totalCents: updatedListing.priceCents + PLATFORM_FEE_CENTS + SERVICE_FEE_CENTS,
        pickupCode,
        status: "PENDING_PAYMENT",
        pickupWindowStart: updatedListing.pickupWindowStart,
        pickupWindowEnd: updatedListing.pickupWindowEnd,
        items: {
          create: {
            listingId: updatedListing.id,
            quantity: 1,
            originalPriceCents: updatedListing.originalPriceCents,
            discountRate: updatedListing.discountRate,
            finalPriceCents: updatedListing.priceCents,
          },
        },
        payments: {
          create: {
            method: "WALLET",
            amountCents: updatedListing.priceCents + PLATFORM_FEE_CENTS + SERVICE_FEE_CENTS,
            status: "PENDING",
            externalGatewayId: paymentRef,
          },
        },
      },
      include: { payments: true },
    });
  });

  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");

  redirect(`/pay/${order.id}`);
}

// A supervisor can confirm the pickup of an order, which updates the order status to "PICKED_UP" and records the pickup time.
export async function confirmPickup(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  const now = new Date();
  await settleUnavailableOrders(now);
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  const membership = await prisma.diningHallMember.findFirst({
    where: { userId: supervisor.id, relation: { in: ["OWNER", "SUPERVISOR"] } },
    select: { diningHallId: true },
  });
  if (!membership) return;

  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT", diningHallId: membership.diningHallId },
    data: { status: "PICKED_UP", pickedUpAt: now },
  });

  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");
}

// Supervisors can withdraw an unexpired listing; paid reservations are refunded by the settlement step.
export async function withdrawListing(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  const membership = await prisma.diningHallMember.findFirst({
    where: { userId: supervisor.id, relation: { in: ["OWNER", "SUPERVISOR"] } },
    select: { diningHallId: true },
  });
  if (!membership) return;
  const now = new Date();
  await settleUnavailableOrders(now);
  await prisma.listing.updateMany({
    where: { id: listingId, diningHallId: membership.diningHallId, status: { in: ["ACTIVE", "SOLD_OUT"] }, pickupWindowEnd: { gt: now } },
    data: { status: "CANCELLED", updatedAt: now },
  });
  revalidatePath("/merchant");
  revalidatePath("/orders");
  revalidatePath("/");
}

// A supervisor can switch between the merchant and student pages.
export async function changePage(formData: FormData) {
  await requireRole("SUPERVISOR");
  const from = String(formData.get("from") ?? "/merchant");
  redirect(from === "/merchant" ? "/orders" : "/merchant");
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function generatePickupCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
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

  await prisma.order.updateMany({
    where: {
      id: ref,
      studentId: user.id,
      status: "PENDING_PAYMENT",
      pickupWindowEnd: { gt: now },
    },
    data: { status: "CONFIRMED", updatedAt: now },
  });

  revalidatePath(`/pay/${ref}`);
  revalidatePath("/orders");
  revalidatePath("/merchant");
  revalidatePath("/");
}
