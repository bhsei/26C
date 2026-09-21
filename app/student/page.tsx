import prisma from "@/lib/prisma";
import { claimListing } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: "desc" },
    include: { merchant: true },
  });

  return (
    <main className="p-8 space-y-4 font-sans">
      <h1 className="text-2xl font-bold">Available meals</h1>
      {listings.map((l) => (
        <div key={l.id} className="border p-4 rounded flex justify-between items-center">
          <div>
            <div className="font-medium">{l.title}</div>
            <div className="text-sm text-gray-600">
              {l.merchant.name} · ${(l.priceCents / 100).toFixed(2)} ·{" "}
              {l.quantityRemaining} left
            </div>
            {l.description && (
              <div className="text-xs text-gray-500">{l.description}</div>
            )}
          </div>
          <form action={claimListing}>
            <input type="hidden" name="listingId" value={l.id} />
            <button
              type="submit"
              disabled={l.quantityRemaining <= 0}
              className="border px-4 py-2 disabled:opacity-40"
            >
              {l.quantityRemaining <= 0 ? "Sold out" : "Claim"}
            </button>
          </form>
        </div>
      ))}
    </main>
  );
}