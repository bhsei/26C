import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.order.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany();
  await prisma.diningHall.deleteMany();

  const pickupWindowStart = new Date(Date.now() + 15 * 60 * 1000);
  const pickupWindowEnd = new Date(Date.now() + 45 * 60 * 1000);
  const diningHall = await prisma.diningHall.create({
    data: {
      id: "hall-main",
      name: "Main Dining Hall",
      address: "Main Campus",
      listings: {
        create: [
          {
            id: "listing-1",
            title: "Chicken Rice Closing Bag",
            description: "Hainanese-style chicken, rice, and soup from dinner service.",
            originalPriceCents: 1375,
            priceCents: 550,
            discountRate: 60,
            quantityTotal: 14,
            quantityRemaining: 14,
            allergens: ["soy", "sesame"],
            pickupWindowStart,
            pickupWindowEnd,
          },
          {
            id: "listing-2",
            title: "Beef Noodle Bowl",
            description: "Braised beef and hand-pulled noodles.",
            originalPriceCents: 1950,
            priceCents: 780,
            discountRate: 60,
            quantityTotal: 5,
            quantityRemaining: 5,
            allergens: ["wheat", "soy"],
            pickupWindowStart,
            pickupWindowEnd,
          },
          {
            id: "listing-3",
            title: "Seasonal Vegetable Bowl",
            description: "Seasonal greens and brown rice.",
            originalPriceCents: 1200,
            priceCents: 480,
            discountRate: 60,
            quantityTotal: 8,
            quantityRemaining: 8,
            allergens: [],
            pickupWindowStart,
            pickupWindowEnd,
          },
        ],
      },
    },
  });

  await prisma.user.create({
    data: {
      id: "supervisor-1",
      email: "supervisor@secondhelping.test",
      password: "demo-password",
      name: "Dining Hall Supervisor",
      role: "SUPERVISOR",
      diningHallId: diningHall.id,
    },
  });
  await prisma.user.create({
    data: {
      id: "student-1",
      email: "student@secondhelping.test",
      password: "demo-password",
      name: "Alex Student",
      followedHalls: { connect: { id: diningHall.id } },
    },
  });
  await prisma.user.create({
    data: {
      id: "admin-0",
      email: "admin@buaa.cn",
      password: "adminadmin",
      name: "System Administrator",
      role: "SUPERVISOR",
      diningHallId: diningHall.id,
    },
  });

  console.log(`Seeded ${diningHall.name} with three closing bags.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
