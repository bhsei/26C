import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/password";
import { syncImpactRecords, getImpactReport } from "../lib/sync";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const demoStaffPassword = await hashPassword("adminadmin");
  const demoStudentPassword = await hashPassword("studentstudent");
  // FK-safe delete order: children → parents
  await prisma.impactRecord.deleteMany();   // NEW: references Order, DiningHall, EmissionFactor
  await prisma.emissionFactor.deleteMany(); // NEW
  await prisma.order.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.listingEvent.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.priceChange.deleteMany();
  await prisma.rescueDispatch.deleteMany();
  await prisma.rescueDestination.deleteMany();
  await prisma.simulationScenario.deleteMany();
  await prisma.surplusForecast.deleteMany();
  await prisma.campaignEvent.deleteMany();
  await prisma.weatherObservation.deleteMany();
  await prisma.dailyProduction.deleteMany();
  await prisma.modelVersion.deleteMany();
  await prisma.pricingPolicy.deleteMany();
  await prisma.listingDraft.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.food.deleteMany();
  await prisma.user.deleteMany();
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
      password: demoStaffPassword,
      name: "Dining Hall Staff Member",
      role: "SUPERVISOR",
      diningHallId: diningHall.id,
    },
  });
  const supervisor2 = await prisma.user.create({
    data: {
      id: "supervisor-2",
      email: "sup2@buaa.test",
      password: demoStaffPassword,
      name: "Dining Hall Staff Member",
      role: "SUPERVISOR",
      diningHallId: diningHall_2.id,
    },
  });
  await prisma.user.create({
    data: {
      id: "student-1",
      email: "stu1@buaa.test",
      password: demoStudentPassword,
      name: "Alex Student",
      role: "STUDENT",
    },
  });

  // ─────────────────────────────────────────────
  // Phase 2.5 (NEW): emission factors for the Impact Estimator
  // PROXY / ILLUSTRATIVE values — replace with documented sources
  // (e.g. WRAP, FAO, EPA) before reporting any real figure.
  // ─────────────────────────────────────────────
  const proxySource = "PROXY-ILLUSTRATIVE (replace with documented source)";
  const factorsValidFrom = new Date("2026-01-01T00:00:00Z");
  await prisma.emissionFactor.createMany({
    data: [
      { id: "ef-cooked-meat-v1",   category: "COOKED_MEAT",       co2ePerKg: 12.0, waterLPerKg: 4500, landM2PerKg: 25.0, source: proxySource, validFrom: factorsValidFrom },
      // Newer factor for the same category → demonstrates versioning by validFrom
      { id: "ef-cooked-meat-v2",   category: "COOKED_MEAT",       co2ePerKg: 13.5, waterLPerKg: 4700, landM2PerKg: 26.0, source: `${proxySource} v2`, validFrom: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      { id: "ef-cooked-veg-v1",    category: "COOKED_VEGETARIAN", co2ePerKg: 2.5,  waterLPerKg: 500,  landM2PerKg: 3.0,  source: proxySource, validFrom: factorsValidFrom },
      { id: "ef-fresh-produce-v1", category: "FRESH_PRODUCE",     co2ePerKg: 0.9,  waterLPerKg: 300,  landM2PerKg: 1.0,  source: proxySource, validFrom: factorsValidFrom },
      { id: "ef-bakery-deli-v1",   category: "BAKERY_DELI",       co2ePerKg: 3.2,  waterLPerKg: 800,  landM2PerKg: 5.0,  source: proxySource, validFrom: factorsValidFrom },
      { id: "ef-dairy-v1",         category: "DAIRY_BASED",       co2ePerKg: 5.0,  waterLPerKg: 1500, landM2PerKg: 9.0,  source: proxySource, validFrom: factorsValidFrom },
      { id: "ef-mixed-food-v1",    category: "MIXED_FOOD",        co2ePerKg: 3.0,  waterLPerKg: 700,  landM2PerKg: 5.0,  source: `${proxySource} generic fallback`, validFrom: factorsValidFrom },
    ],
  });

  // ─────────────────────────────────────────────
  // Phase 3: foods (shared between halls — same dish, two listings)
  // category + unitWeightKg are the inputs of the Impact Estimator
  // ─────────────────────────────────────────────
  const chickenRice = await prisma.food.create({
    data: {
      id: "food-chicken-rice",
      name: "Chicken Rice Closing Bag",
      description: "Hainanese-style chicken, rice, and soup from dinner service.",
      allergens: ["SOY", "SESAME"],
      category: "COOKED_MEAT",
      unitWeightKg: 0.55,
    },
  });
  const beefNoodle = await prisma.food.create({
    data: {
      id: "food-beef-noodle",
      name: "Beef Noodle Bowl",
      description: "Braised beef and hand-pulled noodles.",
      allergens: ["WHEAT", "SOY"],
      category: "COOKED_MEAT",
      unitWeightKg: 0.6,
    },
  });
  const vegBowl = await prisma.food.create({
    data: {
      id: "food-veg-bowl",
      name: "Seasonal Vegetable Bowl",
      description: "Seasonal greens and brown rice.",
      allergens: [],
      category: "COOKED_VEGETARIAN",
      unitWeightKg: 0.45,
    },
  });
  const charSiu = await prisma.food.create({
    data: {
      id: "food-char-siu",
      name: "Char Siu Pork Rice",
      description: "Cantonese roast pork with jasmine rice and greens.",
      allergens: ["SOY"],
      category: "COOKED_MEAT",
      unitWeightKg: 0.5,
    },
  });
  const vegCurry = await prisma.food.create({
    data: {
      id: "food-veg-curry",
      name: "Vegetarian Curry Set",
      description: "Coconut vegetable curry with roti and pickles.",
      allergens: ["GLUTEN"],
      category: "COOKED_VEGETARIAN",
      unitWeightKg: 0.55,
    },
  });
  // NEW — deliberately incomplete food (no category, no weight): its environmental
  // metrics must show up as UNAVAILABLE, proving missing data is never guessed.
  const surpriseBox = await prisma.food.create({
    data: {
      id: "food-surprise-box",
      name: "Chef's Surprise Box",
      description: "Assorted leftovers from the day's service.",
      allergens: [],
      category: null,
      unitWeightKg: null,
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
    // The oldest historical listing uses the incomplete "surprise box" (impact edge case)
    const food = index === 29 ? surpriseBox : foods[index % foods.length];
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
      // NEW — one cancelled + refunded order: must NOT be counted by the Impact Estimator
      const cancelledAndRefunded = listingIndex === 3 && orderIndex === 0;
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
        status: cancelledAndRefunded
          ? "CANCELLED" as const
          : pickedUp ? "PICKED_UP" as const : "RESERVED" as const,
        paymentRef: `demo-payment-${listingIndex + 1}-${orderIndex + 1}`,
        paidAt: createdAt,
        refundedAt: cancelledAndRefunded ? createdAt : null,
        refundAmountCents: cancelledAndRefunded ? listing.priceCents : null,
        pickedUpAt: !cancelledAndRefunded && pickedUp
          ? (listingIndex === 0 ? createdAt : new Date(createdAt.getTime() + 60 * 60 * 1000))
          : null,
        pickupWindowStart: listing.pickupWindowStart,
        pickupWindowEnd: listing.pickupWindowEnd,
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );
  await prisma.order.createMany({ data: demoOrders });

  // ─────────────────────────────────────────────
  // Phase 4.5 (NEW): impact records derived from PICKED_UP orders
  // ─────────────────────────────────────────────
  const impactSync = await syncImpactRecords(prisma);
  const impact = await getImpactReport(prisma);
  const all = impact.aggregates.ALL;
  console.log(
    `Impact records: ${impactSync.upserted} | meals=${all.mealsRescued.total}` +
    ` kg=${all.kgDiverted.total} co2e=${all.co2Avoided.total}kg` +
    ` water=${all.waterSaved.total}L land=${all.landSaved.total}m2` +
    ` savings=${(all.studentSavings.total / 100).toFixed(2)}` +
    ` (co2 coverage ${((all.co2Avoided.coverage ?? 0) * 100).toFixed(0)}%)`,
  );

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

  const pricingPolicyMain = await prisma.pricingPolicy.create({
    data: {
      id: "policy-main",
      diningHallId: diningHall.id,
      name: "Main Hall Lunch Discount",
      defaultDiscountRate: 40,
      minDiscountRate: 20,
      maxDiscountRate: 75,
      autoApply: true,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      notes: "Protects affordability while clearing surplus before end-of-service.",
    },
  });
  const pricingPolicySecond = await prisma.pricingPolicy.create({
    data: {
      id: "policy-second",
      diningHallId: diningHall_2.id,
      name: "Second Hall Dynamic Closing Bag",
      defaultDiscountRate: 55,
      minDiscountRate: 30,
      maxDiscountRate: 80,
      autoApply: true,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      notes: "Cleans inventory near closing and prioritizes student savings.",
    },
  });

  const modelVersion = await prisma.modelVersion.create({
    data: {
      id: "model-v1",
      name: "surplus-baseline-v1",
      modelFamily: "surplus-forecast",
      versionLabel: "v1.0",
      notes: "Baseline forecast using sales, weather, and event intensity.",
      publishedAt: new Date("2026-11-01T00:00:00Z"),
    },
  });

  const weatherMain = await prisma.weatherObservation.create({
    data: {
      id: "weather-main-1",
      diningHallId: diningHall.id,
      observedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      temperatureC: 24.8,
      precipitationMm: 0,
      humidityPct: 64,
      condition: "clear",
      source: "campus weather station",
    },
  });
  const weatherSecond = await prisma.weatherObservation.create({
    data: {
      id: "weather-second-1",
      diningHallId: diningHall_2.id,
      observedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      temperatureC: 22.1,
      precipitationMm: 3.5,
      humidityPct: 71,
      condition: "partly-cloudy",
      source: "campus weather station",
    },
  });

  const campaignEvent = await prisma.campaignEvent.create({
    data: {
      id: "campus-lecture-night",
      diningHallId: diningHall.id,
      name: "Engineering lecture night",
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      expectedAttendance: 240,
      category: "lecture",
      notes: "Evening event often shifts dinner demand away from the meat station.",
    },
  });

  await prisma.dailyProduction.createMany({
    data: [
      {
        id: "prod-main-meat",
        diningHallId: diningHall.id,
        producedOn: new Date(Date.now() - 12 * 60 * 60 * 1000),
        category: "COOKED_MEAT",
        preparedMeals: 90,
        soldMeals: 61,
        leftoverMeals: 29,
        preparedKg: 52.5,
        leftoverKg: 16.5,
      },
      {
        id: "prod-main-veg",
        diningHallId: diningHall.id,
        producedOn: new Date(Date.now() - 12 * 60 * 60 * 1000),
        category: "COOKED_VEGETARIAN",
        preparedMeals: 70,
        soldMeals: 58,
        leftoverMeals: 12,
        preparedKg: 31.5,
        leftoverKg: 5.3,
      },
      {
        id: "prod-second-meat",
        diningHallId: diningHall_2.id,
        producedOn: new Date(Date.now() - 10 * 60 * 60 * 1000),
        category: "COOKED_MEAT",
        preparedMeals: 110,
        soldMeals: 73,
        leftoverMeals: 37,
        preparedKg: 65.8,
        leftoverKg: 19.7,
      },
      {
        id: "prod-second-veg",
        diningHallId: diningHall_2.id,
        producedOn: new Date(Date.now() - 10 * 60 * 60 * 1000),
        category: "COOKED_VEGETARIAN",
        preparedMeals: 60,
        soldMeals: 52,
        leftoverMeals: 8,
        preparedKg: 26.4,
        leftoverKg: 3.6,
      },
    ],
  });

  await prisma.surplusForecast.createMany({
    data: [
      {
        id: "forecast-main-meat",
        diningHallId: diningHall.id,
        category: "COOKED_MEAT",
        forecastDate: new Date(Date.now() + 18 * 60 * 60 * 1000),
        predictedSurplusMeals: 22,
        predictedSurplusKg: 12.1,
        confidence: 0.74,
        modelVersionId: modelVersion.id,
        weatherObservationId: weatherMain.id,
        campaignEventId: campaignEvent.id,
        notes: "This evening's lecture surge reduces student meat demand near closing.",
      },
      {
        id: "forecast-main-veg",
        diningHallId: diningHall.id,
        category: "COOKED_VEGETARIAN",
        forecastDate: new Date(Date.now() + 18 * 60 * 60 * 1000),
        predictedSurplusMeals: 11,
        predictedSurplusKg: 4.9,
        confidence: 0.69,
        modelVersionId: modelVersion.id,
        weatherObservationId: weatherMain.id,
        campaignEventId: campaignEvent.id,
        notes: "Vegetarian station is stable but still trending into surplus.",
      },
      {
        id: "forecast-second-main",
        diningHallId: diningHall_2.id,
        category: "COOKED_MEAT",
        forecastDate: new Date(Date.now() + 22 * 60 * 60 * 1000),
        predictedSurplusMeals: 18,
        predictedSurplusKg: 10.5,
        confidence: 0.71,
        modelVersionId: modelVersion.id,
        weatherObservationId: weatherSecond.id,
        notes: "Moisture and a lighter lunch shift increase late meat surplus risk.",
      },
    ],
  });

  await prisma.rescueDestination.createMany({
    data: [
      {
        id: "dest-pantry",
        name: "Campus Pantry",
        type: "PANTRY",
        address: "Student Center, East Wing",
        capacityKg: 250,
        active: true,
      },
      {
        id: "dest-shelter",
        name: "Night Shelter",
        type: "SHELTER",
        address: "North Community Services",
        capacityKg: 180,
        active: true,
      },
      {
        id: "dest-compost",
        name: "Dining Hall Compost",
        type: "COMPOST",
        address: "Back-of-house loading bay",
        capacityKg: 400,
        active: true,
      },
    ],
  });

  await prisma.rescueDispatch.createMany({
    data: [
      {
        id: "dispatch-main-1",
        diningHallId: diningHall.id,
        destinationId: "dest-pantry",
        category: "COOKED_VEGETARIAN",
        dispatchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        kgRedistributed: 7.4,
        status: "COMPLETED",
        notes: "Delivered to student pantry after final lecture-period pickup rush.",
      },
      {
        id: "dispatch-second-1",
        diningHallId: diningHall_2.id,
        destinationId: "dest-shelter",
        category: "COOKED_MEAT",
        dispatchedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        kgRedistributed: 9.2,
        status: "DISPATCHED",
        notes: "Shelf-stable dishes routed before the end-of-day close window.",
      },
    ],
  });

  await prisma.simulationScenario.createMany({
    data: [
      {
        id: "sim-lecture-night",
        diningHallId: diningHall.id,
        name: "Lecture-night prep reduction",
        scenarioDate: new Date(Date.now() + 18 * 60 * 60 * 1000),
        description: "Reduce prep by 15% to simulate lower surplus risk.",
        inputs: { prepReductionPct: 15, targetCategory: "COOKED_MEAT" },
        outputs: { predictedMealsSaved: 11, expectedWastageReductionKg: 6.2 },
      },
      {
        id: "sim-rain-day",
        diningHallId: diningHall_2.id,
        name: "Rain-day pricing scenario",
        scenarioDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        description: "Rainy weather reduces demand, so a stronger end-of-service discount is evaluated.",
        inputs: { weather: "partly-cloudy", expectedDemandShift: -0.12 },
        outputs: { projectedPickupRate: 0.7, expectedRescueMeals: 19 },
      },
    ],
  });

  await prisma.listingDraft.createMany({
    data: [
      {
        id: "draft-main-1",
        diningHallId: diningHall.id,
        createdById: supervisor1.id,
        foodId: vegBowl.id,
        title: "Vegetable bowl draft",
        originalPriceCents: 1200,
        priceCents: 540,
        discountRate: 55,
        quantityTotal: 16,
        pickupWindowStart: new Date(Date.now() + 30 * 60 * 1000),
        pickupWindowEnd: new Date(Date.now() + 5 * 60 * 60 * 1000),
        status: "DRAFT",
        notes: "Candidate for evening closing-bag listing.",
      },
      {
        id: "draft-second-1",
        diningHallId: diningHall_2.id,
        createdById: supervisor2.id,
        foodId: charSiu.id,
        title: "Char siu rice draft",
        originalPriceCents: 1450,
        priceCents: 580,
        discountRate: 60,
        quantityTotal: 12,
        pickupWindowStart: new Date(Date.now() + 45 * 60 * 1000),
        pickupWindowEnd: new Date(Date.now() + 6 * 60 * 60 * 1000),
        status: "PUBLISHED",
        notes: "Fast-moving item; publish with a prompt override if demand spikes.",
      },
    ],
  });

  await prisma.listingEvent.createMany({
    data: [
      {
        id: "event-listing-1",
        listingId: "listing-1",
        eventType: "CREATED",
        metadata: { source: "web-form" },
      },
      {
        id: "event-listing-2",
        listingId: "listing-1",
        eventType: "PRICE_UPDATED",
        metadata: { oldPriceCents: 1375, newPriceCents: 550, reason: "end-of-day closing-bag push" },
      },
      {
        id: "event-listing-3",
        listingId: "listing-7",
        eventType: "SOLD_OUT",
        metadata: { soldOutAt: new Date().toISOString() },
      },
    ],
  });

  await prisma.priceChange.createMany({
    data: [
      {
        id: "price-change-1",
        listingId: "listing-1",
        pricingPolicyId: pricingPolicyMain.id,
        oldPriceCents: 1375,
        newPriceCents: 550,
        reason: "Automatic closing-bag discount",
        appliedAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        id: "price-change-2",
        listingId: "listing-7",
        pricingPolicyId: pricingPolicySecond.id,
        oldPriceCents: 1450,
        newPriceCents: 580,
        reason: "Demand-balancing policy",
        appliedAt: new Date(Date.now() - 75 * 60 * 1000),
      },
    ],
  });

  await prisma.mediaAsset.createMany({
    data: [
      {
        id: "asset-1",
        kind: "IMAGE",
        url: "https://example.com/images/chicken-rice.jpg",
        filename: "chicken-rice.jpg",
        listingId: "listing-1",
      },
      {
        id: "asset-2",
        kind: "IMAGE",
        url: "https://example.com/images/veg-bowl.jpg",
        filename: "veg-bowl.jpg",
        listingDraftId: "draft-main-1",
      },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
