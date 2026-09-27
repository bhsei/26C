"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";

const PLATFORM_FEE_CENTS = 25;
const SERVICE_FEE_CENTS = 25;

export async function createListing(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const originalPriceCents = Number(formData.get("originalPriceCents") ?? 0);
  const discountRate = Number(formData.get("discountRate") ?? 60);
  const quantityTotal = Number(formData.get("quantityTotal") ?? 0);
  const pickupWindowStart = new Date(String(formData.get("pickupWindowStart") ?? ""));
  const pickupWindowEnd = new Date(String(formData.get("pickupWindowEnd") ?? ""));
  const allergens = String(formData.get("allergens") ?? "")
    .split(",").map((allergen) => allergen.trim().toLowerCase()).filter(Boolean);

  if (!title || !Number.isInteger(originalPriceCents) || originalPriceCents <= 0 ||
      !Number.isInteger(discountRate) || discountRate < 0 || discountRate > 100 ||
      !Number.isInteger(quantityTotal) || quantityTotal <= 0 ||
      Number.isNaN(pickupWindowStart.getTime()) || Number.isNaN(pickupWindowEnd.getTime()) ||
      pickupWindowStart <= new Date() || pickupWindowEnd <= pickupWindowStart) return;

  await prisma.listing.create({
    data: {
      diningHallId: supervisor.diningHallId,
      createdById: supervisor.id,
      title,
      description: description || null,
      originalPriceCents,
      priceCents: Math.round(originalPriceCents * (100 - discountRate) / 100),
      discountRate,
      quantityTotal,
      quantityRemaining: quantityTotal,
      allergens,
      pickupWindowStart,
      pickupWindowEnd,
    },
  });

  revalidatePath("/merchant");
  revalidatePath("/student");
}

export async function claimListing(formData: FormData) {
  const student = await requireRole("STUDENT");
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findFirst({
      where: { id: listingId, status: "ACTIVE", quantityRemaining: { gt: 0 }, pickupWindowEnd: { gt: new Date() } },
    });
    if (!listing) return;

    const inventory = await tx.listing.updateMany({
      where: { id: listingId, quantityRemaining: { gte: 1 }, status: "ACTIVE" },
      data: { quantityRemaining: { decrement: 1 } },
    });
    if (!inventory.count) return;

    if (listing.quantityRemaining === 1) {
      await tx.listing.update({ where: { id: listingId }, data: { status: "SOLD_OUT" } });
    }

    await tx.order.create({
      data: {
        listingId,
        studentId: student.id,
        quantity: 1,
        originalPriceCents: listing.originalPriceCents,
        discountRate: listing.discountRate,
        finalPriceCents: listing.priceCents,
        platformFeeCents: PLATFORM_FEE_CENTS,
        serviceFeeCents: SERVICE_FEE_CENTS,
        pickupWindowStart: listing.pickupWindowStart,
        pickupWindowEnd: listing.pickupWindowEnd,
      },
    });
  });

  revalidatePath("/merchant");
  revalidatePath("/student");
}

export async function confirmPickup(formData: FormData) {
  const supervisor = await requireRole("SUPERVISOR");
  if (!supervisor.diningHallId) return;
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  await prisma.order.updateMany({
    where: { id: orderId, status: "RESERVED", listing: { diningHallId: supervisor.diningHallId } },
    data: { status: "PICKED_UP", pickedUpAt: new Date() },
  });

  revalidatePath("/merchant");
  revalidatePath("/student");
}

export async function changePage(formData: FormData) {
  await requireRole("SUPERVISOR");

  const from = String(formData.get("from"));
  redirect(from === "/merchant" ? "/student" : "/merchant");
}

