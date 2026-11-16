import prisma from "@/lib/prisma";

export const AUTO_PRICING_MAX_DISCOUNT_RATE = 80;
const REVIEW_INTERVAL_MS = 10 * 60 * 1000;
const RECENT_DEMAND_WINDOW_MS = 20 * 60 * 1000;
const DISCOUNT_STEP = 5;

/**
 * Deterministic, listing-wide discount review. The same current price is shown
 * to every shopper; automatic changes only lower price and never alter orders
 * that already captured their price at reservation time.
 */
export async function adjustAutomaticListingPrices(now = new Date()) {
  const reviewCutoff = new Date(now.getTime() - REVIEW_INTERVAL_MS);
  const listings = await prisma.listing.findMany({
    where: {
      autoPricingEnabled: true,
      status: "ACTIVE",
      quantityRemaining: { gt: 0 },
      pickupWindowEnd: { gt: now },
      OR: [{ lastAutoPriceReviewAt: null }, { lastAutoPriceReviewAt: { lte: reviewCutoff } }],
    },
    select: {
      id: true,
      originalPriceCents: true,
      priceCents: true,
      discountRate: true,
      quantityTotal: true,
      quantityRemaining: true,
      pickupWindowStart: true,
      pickupWindowEnd: true,
      createdAt: true,
      lastAutoPriceReviewAt: true,
      orders: {
        where: { status: { in: ["RESERVED", "PICKED_UP"] } },
        select: { quantity: true, createdAt: true },
      },
    },
  });

  let reviewed = 0;
  let adjusted = 0;
  for (const listing of listings) {
    const durationMs = listing.pickupWindowEnd.getTime() - listing.createdAt.getTime();
    if (durationMs <= 0 || listing.quantityTotal <= 0) continue;
    const elapsedRatio = Math.max(0, Math.min(1, (now.getTime() - listing.createdAt.getTime()) / durationMs));
    const paidUnits = listing.orders.reduce((sum, order) => sum + order.quantity, 0);
    const recentPaidUnits = listing.orders
      .filter((order) => order.createdAt.getTime() >= now.getTime() - RECENT_DEMAND_WINDOW_MS)
      .reduce((sum, order) => sum + order.quantity, 0);
    const paidSellThrough = Math.min(1, paidUnits / listing.quantityTotal);
    const inventoryRatio = listing.quantityRemaining / listing.quantityTotal;
    const minutesRemaining = (listing.pickupWindowEnd.getTime() - now.getTime()) / 60_000;
    const recentSalesThreshold = Math.max(1, Math.ceil(listing.quantityTotal * 0.2));
    const recentDemandIsWeak = recentPaidUnits < recentSalesThreshold;
    const sellThroughIsLagging = paidSellThrough < elapsedRatio * 0.6;
    const hasLateSurplus = minutesRemaining <= 15 && inventoryRatio >= 0.2 && paidSellThrough < 0.8 && recentDemandIsWeak;
    const hasMidWindowSurplus = elapsedRatio >= 0.4 && inventoryRatio >= 0.4 && sellThroughIsLagging && recentDemandIsWeak;

    const nextDiscount = listing.discountRate < AUTO_PRICING_MAX_DISCOUNT_RATE && (hasLateSurplus || hasMidWindowSurplus)
      ? Math.min(AUTO_PRICING_MAX_DISCOUNT_RATE, listing.discountRate + DISCOUNT_STEP)
      : listing.discountRate;
    let reason: string;
    if (nextDiscount > listing.discountRate) {
      reason = `Discount increased ${listing.discountRate}% → ${nextDiscount}%: ${Math.round(listing.quantityRemaining)} of ${listing.quantityTotal} portions remain and paid demand is below the time-based sell-through target.`;
    } else if (listing.discountRate >= AUTO_PRICING_MAX_DISCOUNT_RATE) {
      reason = `No change: the ${AUTO_PRICING_MAX_DISCOUNT_RATE}% maximum discount cap has been reached.`;
    } else if (!recentDemandIsWeak) {
      reason = "No change: recent paid reservations indicate active demand.";
    } else if (!sellThroughIsLagging) {
      reason = "No change: paid sell-through is on track for the elapsed pickup window.";
    } else {
      reason = "No change: the listing has not reached a low-demand adjustment checkpoint.";
    }

    const result = await prisma.listing.updateMany({
      where: {
        id: listing.id,
        status: "ACTIVE",
        autoPricingEnabled: true,
        quantityRemaining: { gt: 0 },
        pickupWindowEnd: { gt: now },
        discountRate: listing.discountRate,
        priceCents: listing.priceCents,
        lastAutoPriceReviewAt: listing.lastAutoPriceReviewAt,
      },
      data: {
        ...(nextDiscount > listing.discountRate ? {
          discountRate: nextDiscount,
          priceCents: Math.round(listing.originalPriceCents * (100 - nextDiscount) / 100),
        } : {}),
        lastAutoPriceReviewAt: now,
        lastAutoPriceReason: reason,
        updatedAt: now,
      },
    });
    if (!result.count) continue;
    reviewed++;
    if (nextDiscount > listing.discountRate) adjusted++;
  }
  return { reviewed, adjusted };
}
