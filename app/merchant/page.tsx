import prisma from "@/lib/prisma";
import { createListing } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MerchantPage() {
  const merchant = await prisma.merchant.findUnique({
    where: { id: "merchant-1" },
    include: {
      listings: {
        orderBy: { createdAt: "desc" },
        include: { orders: true },
      },
    },
  });

  if (!merchant) return <p className="p-8">No merchant. Run the seed.</p>;

  return (
    <main className="p-8 space-y-8 font-sans">
      <h1 className="text-2xl font-bold">Merchant: {merchant.name}</h1>

      {/* 发布餐食表单 */}
      <section className="border p-4 rounded space-y-2 max-w-md">
        <h2 className="font-semibold">Post a meal</h2>
        <form action={createListing} className="space-y-2">
          <input name="title" placeholder="Title" required
                 className="border p-2 w-full" />
          <input name="description" placeholder="Description"
                 className="border p-2 w-full" />
          <input name="priceCents" type="number" placeholder="Price (cents)" required
                 className="border p-2 w-full" />
          <input name="quantityTotal" type="number" placeholder="Quantity" required
                 className="border p-2 w-full" />
          <button type="submit" className="border px-4 py-2">Post</button>
        </form>
      </section>

      {/* 我的所有 listings + 剩余库存 */}
      <section className="space-y-3">
        <h2 className="font-semibold">My listings</h2>
        {merchant.listings.map((l) => (
          <div key={l.id} className="border p-4 rounded">
            <div className="font-medium">{l.title}</div>
            <div className="text-sm text-gray-600">
              ${(l.priceCents / 100).toFixed(2)} ·{" "}
              <span className={l.quantityRemaining === 0 ? "text-red-600" : ""}>
                {l.quantityRemaining} / {l.quantityTotal} left
              </span>{" "}
              · {l.orders.length} orders
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}