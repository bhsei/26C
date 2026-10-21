import prisma from "@/lib/prisma";
import { confirmPickup, createListing, withdrawListing } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import DashboardShell from "@/app/components/DashboardShell";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";
import type { ListingStatus, OrderStatus } from "../generated/prisma/client";

export const dynamic = "force-dynamic";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dateTime = (date: Date) => date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const listingStatusLabel: Record<ListingStatus, string> = { DRAFT: "Draft", ACTIVE: "Active", SOLD_OUT: "Sold out", EXPIRED: "Expired", CANCELLED: "Cancelled" };
const orderStatusLabel: Record<OrderStatus, string> = { PENDING_PAYMENT: "Payment pending", CONFIRMED: "Confirmed", READY_FOR_PICKUP: "Ready for pickup", PICKED_UP: "Picked up", CANCELLED: "Cancelled", EXPIRED: "Expired", NO_SHOW: "No show" };

export default async function MerchantPage() {
  const supervisor = await requireRole("SUPERVISOR");
  await settleUnavailableOrders();

  const membership = await prisma.diningHallMember.findFirst({
    where: { userId: supervisor.id, relation: { in: ["OWNER", "SUPERVISOR"] } },
    select: { diningHallId: true },
  });

  if (!membership?.diningHallId) return <p className="p-8">Your account is not assigned to a dining hall.</p>;

  const diningHall = await prisma.diningHall.findUnique({
    where: { id: membership.diningHallId },
    include: {
      listings: {
        orderBy: { createdAt: "desc" },
        include: {
          foodItem: true,
          orderItems: { include: { order: { include: { items: true } } } },
        },
      },
    },
  });

  const foodItems = await prisma.foodItem.findMany({ where: { diningHallId: membership.diningHallId }, orderBy: { name: "asc" } });

  if (!diningHall) return <p className="p-8 text-blue-900">No dining hall found. Run the seed.</p>;

  const termStart = new Date(new Date().getFullYear(), new Date().getMonth() - 4, 1);
  const termOrders = diningHall.listings.flatMap((listing) => listing.orderItems.map((item) => item.order)).filter((order) => order.createdAt >= termStart);
  const mealsRescued = termOrders.filter((order) => order.status === "PICKED_UP").reduce((sum, order) => sum + order.items.reduce((inner: number, item) => inner + item.quantity, 0), 0);
  const savings = termOrders.filter((order) => order.status === "PICKED_UP").reduce((sum, order) => sum + order.items.reduce((inner: number, item) => inner + item.finalPriceCents * item.quantity, 0), 0);

  return (
    <DashboardShell user={supervisor} active="listings">
      <div className="business-page">
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Meals rescued this term" value={String(mealsRescued)} />
          <Stat label="Student savings this term" value={money(savings)} />
          <Stat label="Orders this term" value={String(termOrders.length)} />
        </section>
        <section className="max-w-2xl space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <div><h2 className="font-semibold text-blue-900">Post a closing bag</h2><p className="text-sm text-blue-700">Set the regular price, discount, quantity, and pickup window.</p></div>
          <form action={createListing} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-blue-800 sm:col-span-2">
              Food
              <select name="foodId" required defaultValue="" className="rounded-lg border border-blue-200 bg-white p-2">
                <option value="" disabled>Choose a dish…</option>
                {foodItems.map((food) => (
                  <option key={food.id} value={food.id}>{food.name}</option>
                ))}
              </select>
            </label>
            <input name="quantityTotal" type="number" min="1" placeholder="Quantity available" required className="rounded-lg border border-blue-200 bg-white p-2" />
            <input name="originalPriceCents" type="number" min="1" placeholder="Regular price (cents)" required className="rounded-lg border border-blue-200 bg-white p-2" />
            <label className="grid gap-1 text-sm text-blue-800">Discount (%)<input name="discountRate" type="number" min="0" max="100" defaultValue="60" required className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950" /></label>
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm text-blue-800">Pickup starts<input name="pickupWindowStart" type="datetime-local" required className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950" /></label>
              <label className="grid gap-1 text-sm text-blue-800">Pickup ends<input name="pickupWindowEnd" type="datetime-local" required className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950" /></label>
            </div>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 sm:col-span-2">Publish closing bag</button>
          </form>
        </section>
        <section className="space-y-4"><h2 className="font-semibold text-blue-900">Listings and orders</h2>
          {diningHall.listings.map((listing) => (
            <article key={listing.id} className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{listing.foodItem?.name ?? listing.title}</h3>
                  <p className="text-sm text-blue-700">{money(listing.priceCents)} · {Math.round(listing.discountRate * 100)}% off · {listing.quantityRemaining}/{listing.quantityTotal} left · {listing.orderItems.length} orders</p>
                  <p className="text-xs text-blue-600">Pickup: {dateTime(listing.pickupWindowStart)}–{dateTime(listing.pickupWindowEnd)}</p>
                  {listing.description && <p className="text-sm text-blue-800">{listing.description}</p>}
                </div>
                <div className="listing-actions">
                  <span className={`listing-status listing-status-${listing.status.toLowerCase()}`}>{listingStatusLabel[listing.status]}</span>
                  {listing.status === "ACTIVE" || listing.status === "SOLD_OUT" ? (listing.pickupWindowEnd > new Date() && (
                    <form action={withdrawListing}><input type="hidden" name="listingId" value={listing.id} /><button type="submit" className="withdraw-button">Withdraw listing</button></form>
                  )) : null}
                </div>
              </div>
              {listing.orderItems.length > 0 && (
                <div className="border-t border-blue-100 pt-3">
                  <h4 className="mb-2 text-sm font-semibold">Order status</h4>
                  <ul className="space-y-2 text-sm">
                    {listing.orderItems.map(({ order }) => {
                      const canConfirm = order.status === "CONFIRMED" && listing.pickupWindowEnd > new Date();
                      return (
                        <li key={order.id} className="merchant-order-row">
                          <div>
                            <span className="merchant-order-status">{orderStatusLabel[order.status]}</span>
                            <span className="merchant-order-price"> · {money(order.items.reduce((sum: number, item) => sum + item.finalPriceCents * item.quantity, 0))}</span>
                          </div>
                          {order.pickupCode && <span className="font-mono">{order.pickupCode}</span>}
                          {canConfirm && <form action={confirmPickup}><input type="hidden" name="orderId" value={order.id} /><button type="submit" className="confirm-pickup-button">Confirm pickup</button></form>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4"><p className="text-sm text-blue-700">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}
