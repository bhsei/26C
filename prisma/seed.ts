import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // FK-safe delete order: children → parents
  await prisma.order.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.food.deleteMany();
  await prisma.user.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.diningHall.deleteMany();

  // Longer window so the demo doesn't empty itself 45 min after seeding
  const pickupWindowStart = new Date(Date.now() + 15 * 60 * 1000);
  const pickupWindowEnd   = new Date(Date.now() + 6 * 60 * 60 * 1000);

  // ─────────────────────────────────────────────
  // Phase 1: dining halls (no listings yet)
  // ─────────────────────────────────────────────
  const diningHall = await prisma.diningHall.create({
    data: { id: "hall-main", name: "Main Dining Hall", address: "Main Campus" },
  });
  const diningHall_2 = await prisma.diningHall.create({
    data: { id: "hall-2", name: "2nd Dining Hall", address: "Main Campus" },
  });

  // ─────────────────────────────────────────────
  // Phase 2: users (now halls exist)
  // ─────────────────────────────────────────────
  const supervisor1 = await prisma.user.create({
    data: {
      id: "supervisor-1",
      email: "sup1@buaa.test",
      password: "adminadmin",
      name: "Dining Hall Staff Member",
      role: "SUPERVISOR",
      diningHallId: diningHall.id,
    },
  });
  const supervisor2 = await prisma.user.create({
    data: {
      id: "supervisor-2",
      email: "sup2@buaa.test",
      password: "adminadmin",
      name: "Dining Hall Staff Member",
      role: "SUPERVISOR",
      diningHallId: diningHall_2.id,
    },
  });
  await prisma.user.create({
    data: {
      id: "student-1",
      email: "stu1@buaa.test",
      password: "studentstudent",
      name: "Alex Student",
      role: "STUDENT",
    },
  });

  // ─────────────────────────────────────────────
  // Phase 3: foods (shared between halls — same dish, two listings)
  // ─────────────────────────────────────────────
  const chickenRice = await prisma.food.create({
    data: {
      id: "food-chicken-rice",
      name: "Chicken Rice Closing Bag",
      description: "Hainanese-style chicken, rice, and soup from dinner service.",
      allergens: ["SOY", "SESAME"],
    },
  });
  const beefNoodle = await prisma.food.create({
    data: {
      id: "food-beef-noodle",
      name: "Beef Noodle Bowl",
      description: "Braised beef and hand-pulled noodles.",
      allergens: ["WHEAT", "SOY"],
    },
  });
  const vegBowl = await prisma.food.create({
    data: {
      id: "food-veg-bowl",
      name: "Seasonal Vegetable Bowl",
      description: "Seasonal greens and brown rice.",
      allergens: [],
    },
  });
  const charSiu = await prisma.food.create({
    data: {
      id: "food-char-siu",
      name: "Char Siu Pork Rice",
      description: "Cantonese roast pork with jasmine rice and greens.",
      allergens: ["SOY"],
    },
  });
  const vegCurry = await prisma.food.create({
    data: {
      id: "food-veg-curry",
      name: "Vegetarian Curry Set",
      description: "Coconut vegetable curry with roti and pickles.",
      allergens: ["GLUTEN"],
    },
  });

  // ─────────────────────────────────────────────
  // Phase 4: listings — reference foodId, no title/description/allergens here
  // ─────────────────────────────────────────────
  await prisma.listing.createMany({
    data: [
      {
        id: "listing-1",
        diningHallId: diningHall.id,
        createdById: supervisor1.id,
        foodId: chickenRice.id,
        originalPriceCents: 1375,
        priceCents: 550,
        discountRate: 60,
        quantityTotal: 14,
        quantityRemaining: 14,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-2",
        diningHallId: diningHall.id,
        createdById: supervisor1.id,
        foodId: beefNoodle.id,
        originalPriceCents: 1950,
        priceCents: 780,
        discountRate: 60,
        quantityTotal: 5,
        quantityRemaining: 5,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-3",
        diningHallId: diningHall.id,
        createdById: supervisor1.id,
        foodId: vegBowl.id,
        originalPriceCents: 1200,
        priceCents: 480,
        discountRate: 60,
        quantityTotal: 8,
        quantityRemaining: 8,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-4",
        diningHallId: diningHall_2.id,
        createdById: supervisor2.id,
        foodId: chickenRice.id,
        originalPriceCents: 1375,
        priceCents: 550,
        discountRate: 60,
        quantityTotal: 14,
        quantityRemaining: 14,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-5",
        diningHallId: diningHall_2.id,
        createdById: supervisor2.id,
        foodId: beefNoodle.id,
        originalPriceCents: 1950,
        priceCents: 780,
        discountRate: 60,
        quantityTotal: 5,
        quantityRemaining: 5,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-6",
        diningHallId: diningHall_2.id,
        createdById: supervisor2.id,
        foodId: vegBowl.id,
        originalPriceCents: 1200,
        priceCents: 480,
        discountRate: 60,
        quantityTotal: 8,
        quantityRemaining: 8,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-7",
        diningHallId: diningHall_2.id,
        createdById: supervisor2.id,
        foodId: charSiu.id,
        originalPriceCents: 1450,
        priceCents: 580,
        discountRate: 60,
        quantityTotal: 10,
        quantityRemaining: 10,
        pickupWindowStart,
        pickupWindowEnd,
      },
      {
        id: "listing-8",
        diningHallId: diningHall_2.id,
        createdById: supervisor2.id,
        foodId: vegCurry.id,
        originalPriceCents: 1300,
        priceCents: 520,
        discountRate: 60,
        quantityTotal: 6,
        quantityRemaining: 6,
        pickupWindowStart,
        pickupWindowEnd,
      },
    ],
  });

  // Historical demo listings are expired so they enrich analytics without cluttering the student marketplace.
  const historicalListings = Array.from({ length: 30 }, (_, index) => {
    const ageDays = index;
    const createdAt = new Date(Date.now() - (ageDays * 24 + 4) * 60 * 60 * 1000);
    const pickupWindowStart = new Date(createdAt.getTime() - 30 * 60 * 1000);
    const pickupWindowEnd = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000);
    const foods = [chickenRice, beefNoodle, vegBowl, charSiu, vegCurry];
    const food = foods[index % foods.length];
    const originalPriceCents = [1375, 1950, 1200, 1450, 1300, 1680, 2150, 980, 1750, 1425][index % 10];
    const discountRate = [35, 40, 45, 50, 55, 60, 65, 70, 75, 80][index % 10];
    const quantityTotal = 10 + (index * 7) % 18;
    const sampleOrderCount = 3 + (index % 5);
    return {
      id: `demo-listing-${index + 1}`,
      diningHallId: index % 2 === 0 ? diningHall.id : diningHall_2.id,
      createdById: index % 2 === 0 ? supervisor1.id : supervisor2.id,
      foodId: food.id,
      originalPriceCents,
      priceCents: Math.round(originalPriceCents * (100 - discountRate) / 100),
      discountRate,
      quantityTotal,
      quantityRemaining: quantityTotal - sampleOrderCount,
      pickupWindowStart,
      pickupWindowEnd,
      status: "EXPIRED" as const,
      createdAt,
      updatedAt: createdAt,
    };
  });
  await prisma.listing.createMany({ data: historicalListings });

  // Three to seven varied sample orders per listing, spread across the last month.
  const demoOrders = historicalListings.flatMap((listing, listingIndex) =>
    Array.from({ length: 3 + (listingIndex % 5) }, (_, orderIndex) => {
      const createdAt = listingIndex === 0
        ? new Date(Date.now() - (3 - orderIndex) * 10 * 60 * 1000)
        : new Date(listing.createdAt.getTime() + orderIndex * 25 * 60 * 1000);
      const pickedUp = (listingIndex + orderIndex) % 5 !== 0;
      return {
        id: `demo-order-${listingIndex + 1}-${orderIndex + 1}`,
        listingId: listing.id,
        studentId: "student-1",
        quantity: 1,
        originalPriceCents: listing.originalPriceCents,
        discountRate: listing.discountRate,
        finalPriceCents: listing.priceCents,
        platformFeeCents: 25,
        serviceFeeCents: 25,
        pickupCode: `DEMO-${String(listingIndex + 1).padStart(2, "0")}-${String(orderIndex + 1).padStart(2, "0")}`,
        status: pickedUp ? "PICKED_UP" as const : "RESERVED" as const,
        paymentRef: `demo-payment-${listingIndex + 1}-${orderIndex + 1}`,
        paidAt: createdAt,
        pickedUpAt: pickedUp ? (listingIndex === 0 ? createdAt : new Date(createdAt.getTime() + 60 * 60 * 1000)) : null,
        pickupWindowStart: listing.pickupWindowStart,
        pickupWindowEnd: listing.pickupWindowEnd,
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );
  await prisma.order.createMany({ data: demoOrders });
  
  //
  // Phase 5: Notifications
  //
  await prisma.notification.createMany({
    data: [
      {
        userId: "student-1",
        message: "Get ready! Your pickup window for Chicken Rice Closing Bag opens in 10 minutes. Your pickup code is: A3K9-J7M2-X4.",
        isRead: false,
      },
      {
        userId: "student-1",
        message: "Warning: Your pickup window closes in 30 minutes! Please pick up your order. Don't forget to show your pickup code: Y5R8-T2H6-P9.",
        isRead: true, 
      },
      {
        userId: supervisor1.id,
        message: "A new order was placed for Chicken Rice Closing Bag (Pickup Code: A3K9-J7M2-X4).",
        isRead: false,
      },
      {
        userId: supervisor1.id,
        message: "Great news! Your listing for Char Siu Pork Rice has completely sold out.",
        isRead: false,
      },
      {
        userId: supervisor2.id,
        message: "A new order was placed for Beef Noodle Bowl (Pickup Code: Y5R8-T2H6-P9).",
        isRead: false,
      }
    ],
  });
  console.log(
    `Sample data seeded successfully. Dining halls: ${diningHall.name}, ${diningHall_2.name}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
