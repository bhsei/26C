import prisma from "@/lib/prisma";
import { confirmPickup, createListing, changePage } from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { requireRole } from "@/lib/auth";
import LocalClock from "@/app/components/LocalClock";

export const dynamic = "force-dynamic";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dateTime = (date: Date) => date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default async function MerchantPage() {
  const supervisor = await requireRole("SUPERVISOR");
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

  if (!diningHall) return <p className="p-8 text-blue-900">No dining hall found. Run the seed.</p>;

  const termStart = new Date(new Date().getFullYear(), new Date().getMonth() - 4, 1);
  const termOrders = diningHall.listings.flatMap((listing) => listing.orders).filter((order) => order.createdAt >= termStart);
  const mealsRescued = termOrders.filter((order) => order.status === "PICKED_UP").reduce((sum, order) => sum + order.quantity, 0);
  const savings = termOrders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => sum + (order.originalPriceCents - order.finalPriceCents) * order.quantity, 0);

  return (
    <main className="min-h-screen space-y-8 bg-white p-8 font-sans text-blue-950">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">SecondHelping</p>
          <h1 className="text-2xl font-bold">{diningHall.name}</h1>
          </div>
          <div className="flex items-center gap-4">
            <form action={changePage}>
              <input type="hidden" name="from" value="/merchant" />
              <button
                type="submit"
                className="rounded-lg bg-blue-100 px-4 py-2 font-medium text-blue-700 transition hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                Go to Order
              </button>
            </form>
            <LocalClock />
          <form action={logout}>
            <button className="text-sm font-medium text-blue-700 underline">Log out</button>
          </form>
        </div>
      </header>
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
            <select
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
          <input name="quantityTotal" type="number" min="1" placeholder="Quantity available" required className="rounded-lg border border-blue-200 bg-white p-2" />
          <input name="originalPriceCents" type="number" min="1" placeholder="Regular price (cents)" required className="rounded-lg border border-blue-200 bg-white p-2" />
          <label className="grid gap-1 text-sm text-blue-800">Discount (%)<input name="discountRate" type="number" min="0" max="100" defaultValue="60" required className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950" /></label>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-blue-800">
              Pickup starts
              <input
                name="pickupWindowStart"
                type="datetime-local"
                required
                className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950"
              />
            </label>
            <label className="grid gap-1 text-sm text-blue-800">
              Pickup ends
              <input
                name="pickupWindowEnd"
                type="datetime-local"
                required
                className="rounded-lg border border-blue-200 bg-white p-2 text-blue-950"
              />
            </label>
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 sm:col-span-2">Publish closing bag</button>
        </form>
      </section>
      <section className="space-y-4"><h2 className="font-semibold text-blue-900">Closing bags and orders</h2>
        {diningHall.listings.map((listing) => <article key={listing.id} className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{listing.food.name}</h3>
            <p className="text-sm text-blue-700">{money(listing.priceCents)} · {listing.discountRate}% off · {listing.quantityRemaining}/{listing.quantityTotal} left · {listing.orders.length} orders</p>
            <p className="text-xs text-blue-600">Pickup: {dateTime(listing.pickupWindowStart)}–{dateTime(listing.pickupWindowEnd)}</p>
            {listing.food.description && <p className="text-sm text-blue-800">{listing.food.description}</p>}
            {listing.food.allergens.length > 0 && <p className="text-xs text-blue-600">Contains: {listing.food.allergens.join(", ")}</p>}
          </div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">{listing.status.replace("_", " ")}</span></div>
          {listing.orders.length > 0 && <div className="border-t border-blue-100 pt-3"><h4 className="mb-2 text-sm font-semibold">Pickup codes</h4><ul className="space-y-1 text-sm">{listing.orders.map((order) => <li key={order.id} className="flex flex-wrap justify-between gap-2"><span className="font-mono">{order.pickupCode}</span><span className="flex items-center gap-2 text-blue-700">{order.status.replace("_", " ")} · {money(order.finalPriceCents * order.quantity)}{order.status === "RESERVED" && <form action={confirmPickup}><input type="hidden" name="orderId" value={order.id} /><button type="submit" className="rounded bg-green-700 px-2 py-1 text-xs font-medium text-white">Confirm pickup</button></form>}</span></li>)}</ul></div>}
        </article>)}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4"><p className="text-sm text-blue-700">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}


