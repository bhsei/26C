import Link from "next/link";
import prisma from "@/lib/prisma";
import { claimListing } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import DashboardShell from "@/app/components/DashboardShell";
import ClearFiltersLink from "@/app/components/ClearFiltersLink";
import type { Allergen } from "../generated/prisma/client";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";
const COMMON_ALLERGENS = ["gluten", "milk", "eggs", "fish", "shellfish", "tree nuts", "peanuts", "wheat", "soy", "sesame"];
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const asList = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value];
type SearchParams = Promise<{ hall?: string; avoid?: string | string[] }>;

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  await settleUnavailableOrders();
  const avoided = asList(params.avoid).map((allergen) => allergen.toLowerCase()).filter((allergen) => COMMON_ALLERGENS.includes(allergen));
  const selectedHall = params.hall ?? "";
  const [halls, listings, student] = await Promise.all([
    prisma.diningHall.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.listing.findMany({
      where: { status: "ACTIVE", quantityRemaining: { gt: 0 }, pickupWindowEnd: { gt: new Date() }, ...(selectedHall ? { diningHallId: selectedHall } : {}), ...(avoided.length ? { NOT: { food: { allergens: { hasSome: avoided.map((value) => value.toUpperCase().replace(/[ -]+/g, "_") as Allergen) } } } } : {}) },
      orderBy: { pickupWindowStart: "asc" }, include: { diningHall: true, food: true },
    }),
    user ? prisma.user.findUnique({ where: { id: user.id }, include: { orders: { take: 5, orderBy: { createdAt: "desc" }, include: { listing: { include: { diningHall: true, food: true } } } } } }) : Promise.resolve(null),
  ]);
  return <DashboardShell user={user} active="orders">
    <div className="welcome-row"><div><p className="eyebrow">GOOD FOOD, GREAT VALUE</p><h1>Reserve Orders <span>✳</span></h1><p className="subtitle">Browse fresh closing bags and help good food find a second home.</p></div></div>
    <form method="get" className="orders-filter"><label>Dining hall<select name="hall" defaultValue={selectedHall}><option value="">All dining halls</option>{halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select></label><fieldset><legend>Hide meals containing</legend><div className="allergen-list">{COMMON_ALLERGENS.map((allergen) => <label key={allergen}><input type="checkbox" name="avoid" value={allergen} defaultChecked={avoided.includes(allergen)} />{allergen}</label>)}</div></fieldset><button type="submit" className="filter-button">Apply filters</button>{(selectedHall || avoided.length > 0) && <ClearFiltersLink />}</form>
    {student?.orders.length ? <section className="student-orders"><h2>Your recent orders</h2>{student.orders.map((order) => <article key={order.id}><div><b>{order.listing.food.name} · {order.listing.diningHall.name}</b><p>Pickup {order.pickupWindowStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{order.pickupWindowEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>{order.status === "EXPIRED" && <p className="order-alert" role="status">This meal expired before pickup. {order.refundedAt ? `A simulated refund of ${money(order.refundAmountCents ?? 0)} has been recorded for your order.` : "Payment was not completed, so no charge was made."}</p>}{order.status === "CANCELLED" && <p className="order-alert" role="status">This reservation was canceled. {order.refundedAt ? `A simulated refund of ${money(order.refundAmountCents ?? 0)} has been recorded for your order.` : "No payment was collected."}</p>}</div>{order.status === "PENDING_PAYMENT" ? <Link href={`/pay/${order.paymentRef}`} className="reserve-button">Complete payment</Link> : order.status === "RESERVED" ? order.pickupCode ? <code>{order.pickupCode}</code> : <span className="order-state">Pickup code pending</span> : order.status === "PICKED_UP" ? <span className="order-state status-picked">Picked up</span> : <span className={`order-state ${order.status === "EXPIRED" ? "status-expired" : "status-cancelled"}`}>{order.status === "EXPIRED" ? "Expired" : "Cancelled"}</span>}</article>)}</section> : null}
    <section className="listing-grid">{listings.map((listing) => <article key={listing.id} className="listing-card"><div className="meal-emoji">✳</div><div className="listing-copy"><h2>{listing.food.name}</h2><p className="listing-meta">{listing.diningHall.name} · <b>{money(listing.priceCents)}</b> <s>{money(listing.originalPriceCents)}</s> · {listing.discountRate}% off</p><p className="listing-detail">{listing.quantityRemaining} portions available · Pickup {listing.pickupWindowStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{listing.pickupWindowEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p><p className="listing-description">{listing.food.description}</p></div>{user ? <form action={claimListing}><input type="hidden" name="listingId" value={listing.id} /><button className="reserve-button" type="submit">Reserve meal</button></form> : <Link className="reserve-button" href="/login?next=%2Forders">Sign in to reserve</Link>}</article>)}{listings.length === 0 && <p className="empty-state">No meals match those filters right now.</p>}</section>
    {!user && <div className="guest-login-bar"><div><b>Ready to claim a meal?</b><span>Sign in or create a student account to start reserving.</span></div><Link href="/login?next=%2Forders">Log in to order <span>→</span></Link></div>}
  </DashboardShell>;
}

