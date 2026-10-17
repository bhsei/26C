import Link from "next/link";
import prisma from "@/lib/prisma";
import { changePage, claimListing } from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";
import LocalClock from "@/app/components/LocalClock";
import ClearFiltersLink from "@/app/components/ClearFiltersLink";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
const COMMON_ALLERGENS = ["gluten", "milk", "eggs", "fish", "shellfish", "tree nuts", "peanuts", "wheat", "soy", "sesame"];
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const asList = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value];

type SearchParams = Promise<{ hall?: string; avoid?: string | string[] }>;

export default async function StudentPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  const avoided = asList(params.avoid).map((allergen) => allergen.toLowerCase());
  const selectedHall = params.hall ?? "";
  const [halls, listings, student] = await Promise.all([
    prisma.diningHall.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        quantityRemaining: { gt: 0 },
        pickupWindowEnd: { gt: new Date() },
        ...(selectedHall ? { diningHallId: selectedHall } : {}),
        ...(avoided.length ? { NOT: { allergens: { hasSome: avoided } } } : {}),
      },
      orderBy: { pickupWindowStart: "asc" },
      include: { diningHall: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      include: { orders: { orderBy: { createdAt: "desc" }, include: { listing: { include: { diningHall: true } } } } },
    }),
  ]);

  return (
    <main className="min-h-screen space-y-5 bg-white p-8 font-sans text-blue-950">
      <header className="flex items-center justify-between">
        <div><p className="text-sm font-medium uppercase tracking-wide text-blue-600">SecondHelping</p><h1 className="text-2xl font-bold">Available Closing Bags</h1></div>
        <div className="flex items-center gap-4">
          {user.role === "SUPERVISOR" && (
            <form action={changePage}>
              <input type="hidden" name="from" value="/student" />
              <button
                type="submit"
                className="rounded-lg bg-blue-100 px-4 py-2 font-medium text-blue-700 transition hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                Go to Publish
              </button>
            </form>
          )}
        <LocalClock /><form action={logout}><button className="text-sm font-medium text-blue-700 underline">Log out</button></form></div></header>
      <form method="get" className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-blue-900">Dining hall<select name="hall" defaultValue={selectedHall} className="rounded-lg border border-blue-200 bg-white p-2"><option value="">All dining halls</option>{halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select></label>
        <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium text-blue-900">Hide meals containing</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{COMMON_ALLERGENS.map((allergen) => <label key={allergen} className="flex items-center gap-2 text-sm capitalize text-blue-800"><input type="checkbox" name="avoid" value={allergen} defaultChecked={avoided.includes(allergen)} />{allergen}</label>)}</div></fieldset>
        <button type="submit" className="w-fit rounded-lg bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">Apply filters</button>
        {(selectedHall || avoided.length > 0) && <ClearFiltersLink />}
      </form>
      {listings.length === 0 && <p className="rounded-xl border border-blue-200 p-5 text-blue-700">No meals match those filters right now.</p>}
      {student && student.orders.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-blue-900">
            Your reservations and pickup codes
          </h2>

          {student.orders.map((order) => {
            const needsPayment = order.status === "PENDING_PAYMENT";

            return (
              <article
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4"
              >
                <div>
                  <h3 className="font-medium">
                    {order.listing.title} · {order.listing.diningHall.name}
                  </h3>
                  <p className="text-sm text-green-800">
                    {order.status.replace("_", " ")} · Pickup{" "}
                    {order.pickupWindowStart.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    –
                    {order.pickupWindowEnd.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {needsPayment ? (
                  <Link
                    href={`/pay/${order.paymentRef}`}
                    className="rounded-lg bg-yellow-500 px-4 py-2 font-medium text-white hover:bg-yellow-600"
                  >
                    Complete payment
                  </Link>
                ) : (
                  <p className="font-mono text-lg font-bold tracking-widest">
                    {order.pickupCode}
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
      <section className="space-y-3">{listings.map((listing) => <article key={listing.id} className="flex flex-col justify-between gap-4 rounded-xl border border-blue-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="space-y-1"><h2 className="font-semibold">{listing.title}</h2>
          <p className="text-sm text-blue-700">{listing.diningHall.name} · {money(listing.priceCents)} <span className="text-blue-500 line-through">{money(listing.originalPriceCents)}</span> · {listing.discountRate}% off · {listing.quantityRemaining} left</p>
          <p className="text-xs text-blue-600">Pickup {listing.pickupWindowStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{listing.pickupWindowEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
          {listing.description && <p className="text-sm text-blue-800">{listing.description}</p>}
          <p className="text-xs text-blue-600">Allergens: {listing.allergens.length ? listing.allergens.join(", ") : "No allergens listed"}</p>
        </div>
        <form action={claimListing}><input type="hidden" name="listingId" value={listing.id} /><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">Reserve meal</button></form>
      </article>)}</section>
    </main>
  );
}



