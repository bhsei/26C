import prisma from "@/lib/prisma";
import { approveRescueRoute, confirmPickup, createListing, recommendRescueRoute, withdrawListing } from "@/app/actions";
import { evaluateRescueRoute } from "@/lib/rescue-routing";
import { requireRole } from "@/lib/auth";
import DashboardShell from "@/app/components/DashboardShell";
import FoodImageMatcher from "@/app/components/FoodImageMatcher";
import VoiceListingAssistant from "@/app/components/VoiceListingAssistant";
import { AUTO_PRICING_MAX_DISCOUNT_RATE } from "@/lib/dynamic-pricing";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";
import type { ListingStatus, OrderStatus } from "../generated/prisma/client";

export const dynamic = "force-dynamic";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dateTime = (date: Date) => date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const listingStatusLabel: Record<ListingStatus, string> = { ACTIVE: "Active", SOLD_OUT: "Sold out", EXPIRED: "Expired", WITHDRAWN: "Withdrawn" };
const orderStatusLabel: Record<OrderStatus, string> = { PENDING_PAYMENT: "Payment pending", RESERVED: "Reserved", PICKED_UP: "Picked up", CANCELLED: "Cancelled", EXPIRED: "Expired" };

export default async function MerchantPage() {
  const supervisor = await requireRole("SUPERVISOR");
  await settleUnavailableOrders();
  if (!supervisor.diningHallId) return <p className="p-8">Your account is not assigned to a dining hall.</p>;
  const diningHall = await prisma.diningHall.findUnique({
    where: { id: supervisor.diningHallId },
    include: {
      listings: {
        orderBy: { createdAt: "desc" },
        include: { orders: true, food: true },
      },
    },
  });

  const foods = await prisma.food.findMany({ orderBy: { name: "asc" } });

  const rescueDestinations = await prisma.rescueDestination.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const rescueDispatches = await prisma.rescueDispatch.findMany({
    where: { diningHallId: supervisor.diningHallId },
    orderBy: { dispatchedAt: "desc" },
    take: 8,
    include: { destination: true },
  });

  if (!diningHall) return <p className="p-8 text-blue-900">No dining hall found. Run the seed.</p>;

  const rescueSuggestions = diningHall.listings
    .filter((listing) => listing.quantityRemaining > 0 && !["EXPIRED", "WITHDRAWN"].includes(listing.status))
    .map((listing) => ({
      listing,
      recommendation: evaluateRescueRoute({
        food: {
          name: listing.food.name,
          category: listing.food.category,
          unitWeightKg: listing.food.unitWeightKg,
          safeForConsumption: true,
          safeForDonation: listing.food.allergens.length === 0,
        },
        quantityRemaining: listing.quantityRemaining,
        estimatedKg: listing.quantityRemaining * (listing.food.unitWeightKg ?? 0.65),
        minutesUntilDeadline: Math.max(0, (listing.pickupWindowEnd.getTime() - Date.now()) / 60000),
        destinations: rescueDestinations.map((destination) => ({
          id: destination.id,
          name: destination.name,
          type: destination.type,
          address: destination.address,
          capacityKg: destination.capacityKg,
          active: destination.active,
        })),
      }),
    }));

  const termStart = new Date(new Date().getFullYear(), new Date().getMonth() - 4, 1);
  const termOrders = diningHall.listings.flatMap((listing) => listing.orders).filter((order) => order.createdAt >= termStart);
  const mealsRescued = termOrders.filter((order) => order.status === "PICKED_UP").reduce((sum, order) => sum + order.quantity, 0);
  const savings = termOrders.filter((order) => order.status === "PICKED_UP").reduce((sum, order) => sum + (order.originalPriceCents - order.finalPriceCents) * order.quantity, 0);

  return (
    <DashboardShell user={supervisor} active="listings">
    <div className="business-page">
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Meals rescued this term" value={String(mealsRescued)} />
        <Stat label="Student savings this term" value={money(savings)} />
        <Stat label="Orders this term" value={String(termOrders.length)} />
      </section>
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
        <div><h2 className="font-semibold text-blue-900">Post a closing bag</h2><p className="text-sm text-blue-700">Set the regular price, discount, quantity, and pickup window.</p></div>
        <form action={createListing} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-blue-800 sm:col-span-2">
            Food
            <select
              id="foodId"
              name="foodId"
              required
              defaultValue=""
              className="rounded-lg border border-blue-200 bg-white p-2"
            >
              <option value="" disabled>
                Choose a dish…
              </option>
              {foods.map((food) => (
                <option key={food.id} value={food.id}>
                  {food.name}
                </option>
              ))}
            </select>
          </label>
          <input id="quantityTotal" name="quantityTotal" type="number" min="1" placeholder="Quantity available" required className="rounded-lg border border-blue-200 bg-white p-2" />
          <input id="originalPriceCents" name="originalPriceCents" type="number" min="1" placeholder="Regular price (cents)" required className="rounded-lg border border-blue-200 bg-white p-2" />
          <label className="grid gap-1 text-sm text-blue-800">Discount (%)<input id="discountRate" name="discountRate" type="number" min="0" max="100" required className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950" /></label>
          <label className="flex items-start gap-2 text-sm text-blue-800 sm:col-span-2"><input name="autoPricingEnabled" type="checkbox" className="mt-1" /><span><b>Adjust the discount automatically</b><span className="block text-xs text-blue-600">A rule-based policy may increase the discount in 5-point steps, up to {AUTO_PRICING_MAX_DISCOUNT_RATE}%, when time is short, inventory is high, and paid demand is weak. It never raises the price.</span></span></label>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-blue-800">
              Pickup starts
              <input
                name="pickupWindowStart"
                id="pickupWindowStart"
                type="datetime-local"
                required
                className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950"
              />
            </label>
            <label className="grid gap-1 text-sm text-blue-800">
              Pickup ends
              <input
                name="pickupWindowEnd"
                id="pickupWindowEnd"
                type="datetime-local"
                required
                className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950"
              />
            </label>
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 sm:col-span-2">Publish closing bag</button>
        </form>
      </div>
      <div className="space-y-4"><FoodImageMatcher /><VoiceListingAssistant /></div>
      </section>
      
      <section className="space-y-4"><h2 className="font-semibold text-blue-900">Listings and orders</h2>
        {diningHall.listings.map((listing) => <article key={listing.id} className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{listing.food.name}</h3>
            <p className="text-sm text-blue-700">{money(listing.priceCents)} · {listing.discountRate}% off · {listing.quantityRemaining}/{listing.quantityTotal} left · {listing.orders.length} orders</p>
            {listing.autoPricingEnabled && <p className="text-xs font-medium text-blue-700">Automatic discount on · maximum {AUTO_PRICING_MAX_DISCOUNT_RATE}% off{listing.lastAutoPriceReviewAt ? ` · last reviewed ${dateTime(listing.lastAutoPriceReviewAt)}` : ""}</p>}
            {listing.lastAutoPriceReason && <p className="text-xs text-slate-600">Pricing note: {listing.lastAutoPriceReason}</p>}
            <p className="text-xs text-blue-600">Pickup: {dateTime(listing.pickupWindowStart)}–{dateTime(listing.pickupWindowEnd)}</p>
            {listing.food.description && <p className="text-sm text-blue-800">{listing.food.description}</p>}
            {listing.food.allergens.length > 0 && <p className="text-xs text-blue-600">Contains: {listing.food.allergens.join(", ")}</p>}
          </div><div className="listing-actions"><span className={`listing-status listing-status-${listing.status.toLowerCase()}`}>{listingStatusLabel[listing.status]}</span>{["ACTIVE", "SOLD_OUT"].includes(listing.status) && listing.pickupWindowEnd > new Date() && <form action={withdrawListing}><input type="hidden" name="listingId" value={listing.id} /><button type="submit" className="withdraw-button">Withdraw listing</button></form>}</div></div>
            {listing.orders.length > 0 && <div className="border-t border-blue-100 pt-3"><h4 className="mb-2 text-sm font-semibold">Order status</h4><ul className="space-y-2 text-sm">{listing.orders.map((order) => { const canConfirm = order.status === "RESERVED" && !["EXPIRED", "WITHDRAWN"].includes(listing.status) && listing.pickupWindowEnd > new Date(); return <li key={order.id} className="merchant-order-row"><div><span className="merchant-order-status">{orderStatusLabel[order.status]}</span><span className="merchant-order-price"> · {money(order.finalPriceCents * order.quantity)}</span>{order.refundedAt && <p className="refund-note">Simulated refund recorded: {money(order.refundAmountCents ?? 0)}.</p>}{order.status === "EXPIRED" && !order.refundedAt && <p className="refund-note">Expired before payment; no charge was made.</p>}{order.status === "CANCELLED" && !order.refundedAt && <p className="refund-note">Canceled before payment; no charge was made.</p>}</div>{order.pickupCode && <span className="font-mono">{order.pickupCode}</span>}{canConfirm && <form action={confirmPickup}><input type="hidden" name="orderId" value={order.id} /><label className="sr-only" htmlFor={`pickup-${order.id}`}>Enter the student&apos;s pickup code</label><input id={`pickup-${order.id}`} name="pickupCode" required placeholder="Enter pickup code" autoComplete="off" className="rounded border p-2 font-mono" /><button type="submit" className="confirm-pickup-button">Confirm pickup</button></form>}</li>; })}</ul></div>}
        </article>)}
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold text-blue-900">Rescue routing</h2>
        <div className="space-y-3">
          {rescueSuggestions.length === 0 ? (
            <p className="text-sm text-blue-700">No active closing-bag listings need a rescue recommendation.</p>
          ) : rescueSuggestions.map(({ listing, recommendation }) => (
            <div key={listing.id} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{listing.food.name}</h3>
                  <p className="text-sm text-blue-700">{listing.quantityRemaining} remaining · {listing.food.allergens.length > 0 ? `Contains ${listing.food.allergens.join(", ")}` : "No allergen flags recorded"}</p>
                </div>
                <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{recommendation.status}</span>
              </div>
              <p className="mt-2 text-sm text-blue-800">{recommendation.reason}</p>
              <p className="mt-1 text-sm text-blue-700">{recommendation.explanation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {recommendation.recommendedDestination && (
                  <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Recommended: {recommendation.recommendedDestination.name}</span>
                )}
                {recommendation.fallbackDestination && (
                  <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Fallback: {recommendation.fallbackDestination.name}</span>
                )}
              </div>
              <form action={recommendRescueRoute} className="mt-3">
                <input type="hidden" name="listingId" value={listing.id} />
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                  {recommendation.requiresApproval ? "Request operator review" : "Save recommended route"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold text-blue-900">Recent rescue dispatches</h2>
        <div className="space-y-3">
          {rescueDispatches.map((dispatch) => (
            <div key={dispatch.id} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <div className="flex justify-between gap-3">
                <h3 className="font-medium">{dispatch.destination.name}</h3>
                <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{dispatch.status}</span>
              </div>
              <p className="mt-1 text-sm text-blue-800">{dispatch.notes ?? "No note recorded."}</p>
              <p className="mt-2 text-xs text-blue-600">{dispatch.kgRedistributed ?? 0} kg · {dateTime(dispatch.dispatchedAt)}</p>
              {dispatch.status === "PLANNED" && (
                <form action={approveRescueRoute} className="mt-3">
                  <input type="hidden" name="dispatchId" value={dispatch.id} />
                  <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">Approve dispatch</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-blue-200 bg-white p-4"><p className="text-sm text-blue-700">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}
