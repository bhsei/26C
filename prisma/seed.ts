import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // remove all existing data
  await prisma.order.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.merchant.deleteMany();

  const merchant = await prisma.merchant.create({
    data: {
      id: "merchant-1",          // hard-coded ID
      name: "Campus Kitchen",
      listings: {
        create: [
          {
            id: "listing-1",
            title: "Chicken Rice",
            description: "Hainanese style, comes with soup",
            priceCents: 550,
            quantityTotal: 10,
            quantityRemaining: 10,
          },
          {
            id: "listing-2",
            title: "Beef Noodles",
            description: "Braised beef, hand-pulled noodles",
            priceCents: 780,
            quantityTotal: 5,
            quantityRemaining: 5,
          },
          {
            id: "listing-3",
            title: "Veggie Bowl",
            description: "Seasonal greens, brown rice",
            priceCents: 480,
            quantityTotal: 8,
            quantityRemaining: 8,
          },
        ],
      },
    },
  });

  console.log("Seeded merchant:", merchant.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });