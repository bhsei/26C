"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";

const MERCHANT_ID = "merchant-1"; // 硬编码
const STUDENT_ID = "student-1";   // 硬编码

export async function createListing(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceCents = Number(formData.get("priceCents") ?? 0);
  const quantityTotal = Number(formData.get("quantityTotal") ?? 0);

  if (!title || priceCents <= 0 || quantityTotal <= 0) return;

  await prisma.listing.create({
    data: {
      merchantId: MERCHANT_ID,
      title,
      description: description || null,
      priceCents,
      quantityTotal,
      quantityRemaining: quantityTotal,
    },
  });

  revalidatePath("/merchant");
  revalidatePath("/student");
}

export async function claimListing(formData: FormData) {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  // 用事务保证「扣库存 + 建订单」原子性
  await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.quantityRemaining <= 0) return;

    await tx.listing.update({
      where: { id: listingId },
      data: { quantityRemaining: { decrement: 1 } },
    });

    await tx.order.create({
      data: { listingId, studentId: STUDENT_ID, quantity: 1 },
    });
  });

  revalidatePath("/merchant");
  revalidatePath("/student");
}