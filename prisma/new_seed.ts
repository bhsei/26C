// SecondHelping — seed script (>= 10 rows in every table)
// Place at prisma/seed.ts and run:  npx prisma db seed
// package.json:  "prisma": { "seed": "tsx prisma/seed.ts" }   (npm i -D tsx)
//
// Deterministic: ids are fixed strings, dates are relative to BASE.
// Every seeded user has the password "senha123".

import {
  PrismaClient, Role, AccountStatus, DiningHallType, MemberRelation, ListingStatus,
  OrderStatus, PaymentMethod, PaymentStatus, MediaKind, ReportState, ReportSubjectType,
  ModelModule, MealPeriod, CampusEventKind, RecommendationStatus, DraftSource, DraftStatus,
  ListingEventType, RescueDestinationType, DispatchStatus,
} from '@prisma/client'
import { createHash, scryptSync } from 'crypto'

const prisma = new PrismaClient()

// ───────────────────────── helpers ─────────────────────────
const id = (p: string, i: number) => `${p}_${String(i + 1).padStart(3, '0')}`
const at = <T,>(a: T[], i: number): T => a[i % a.length]
const BASE = new Date('2026-10-16T12:00:00Z')
const addH = (h: number) => new Date(BASE.getTime() + h * 3600_000)
const addD = (d: number) => addH(d * 24)
const day = (d: number) => new Date(addD(d).toISOString().slice(0, 10) + 'T00:00:00Z')
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const passwordHash = `scrypt$secondhelping$${scryptSync('senha123', 'secondhelping', 32).toString('hex')}`

async function main() {
  // ───────────────────────── clean (reverse dependency order) ─────────────────────────
  await prisma.impactRecord.deleteMany()
  await prisma.rescueDispatch.deleteMany()
  await prisma.rescueDestination.deleteMany()
  await prisma.emissionFactor.deleteMany()
  await prisma.listingEvent.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.pricingPolicy.deleteMany()
  await prisma.listingDraft.deleteMany()
  await prisma.simulationScenario.deleteMany()
  await prisma.prepRecommendation.deleteMany()
  await prisma.surplusForecast.deleteMany()
  await prisma.dailyProduction.deleteMany()
  await prisma.weatherObservation.deleteMany()
  await prisma.campusEvent.deleteMany()
  await prisma.modelVersion.deleteMany()
  await prisma.report.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.mediaAsset.deleteMany()
  await prisma.listingIngredient.deleteMany()
  await prisma.listing.deleteMany()
  await prisma.foodItemIngredient.deleteMany()
  await prisma.foodItem.deleteMany()
  await prisma.userAllergy.deleteMany()
  await prisma.ingredient.deleteMany()
  await prisma.diningHallMember.deleteMany()
  await prisma.diningHall.deleteMany()
  await prisma.authSession.deleteMany()
  await prisma.studentProfile.deleteMany()
  await prisma.ownerProfile.deleteMany()
  await prisma.moderatorProfile.deleteMany()
  await prisma.user.deleteMany()

  // ───────────────────────── USERS (12 students, 10 owners, 10 moderators) ─────────────────────────
  const firstNames = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Hugo',
    'Isabela', 'Joao', 'Karina', 'Lucas', 'Marina', 'Nicolas', 'Olivia', 'Pedro']
  const lastNames = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Costa', 'Pereira', 'Almeida']
  const person = (i: number) => `${at(firstNames, i)} ${at(lastNames, i * 3 + 1)}`
  const email = (i: number) => `${slug(at(firstNames, i))}.${slug(at(lastNames, i * 3 + 1))}${i + 1}@secondhelping.dev`

  const students = range(12).map((i) => ({ id: id('stu', i), name: person(i), email: email(i), role: Role.STUDENT }))
  const owners = range(10).map((i) => ({ id: id('own', i), name: person(i + 12), email: email(i + 12), role: Role.OWNER }))
  const moderators = range(10).map((i) => ({ id: id('mod', i), name: person(i + 22), email: email(i + 22), role: Role.MODERATOR }))
  const allUsers = [...students, ...owners, ...moderators]

  await prisma.user.createMany({
    data: allUsers.map((u, i) => ({
      ...u,
      passwordHash,
      accountStatus: i % 17 === 16 ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE,
      createdAt: addD(-120 + i),
    })),
  })

  await prisma.studentProfile.createMany({
    data: students.map((s, i) => ({
      userId: s.id,
      gender: at(['female', 'male', 'non_binary'], i),
      age: 18 + ((i * 3) % 11),
      monthlyIncomeCents: at([0, 80000, 130000, 210000, 320000, 450000], i),
      balanceCents: at([2500, 0, 8000, 15000, 4200, 11000], i),
    })),
  })
  await prisma.ownerProfile.createMany({
    data: owners.map((o, i) => ({
      userId: o.id,
      numberOfEmployees: 4 + i * 3,
      monthlyIncomeCents: 800000 + i * 250000,
    })),
  })
  await prisma.moderatorProfile.createMany({
    data: moderators.map((m, i) => ({
      userId: m.id,
      permissions: i < 3
        ? ['REPORTS_READ', 'REPORTS_RESOLVE', 'USERS_SUSPEND', 'LISTINGS_REMOVE']
        : ['REPORTS_READ', 'REPORTS_RESOLVE'],
    })),
  })

  await prisma.authSession.createMany({
    data: range(12).map((i) => ({
      id: id('ses', i),
      userId: allUsers[i * 2].id,
      tokenHash: createHash('sha256').update(`token-${i}`).digest('hex'),
      expiresAt: addD(7 + i),
      createdAt: addH(-i * 5),
    })),
  })

  // ───────────────────────── DINING HALLS (12) ─────────────────────────
  const hallNames = [
    'RU Benfica', 'RU Pici', 'RU Porangabucu', 'Cantina Central', 'Cantina do Direito',
    'Cantina da Engenharia', 'Restaurante Sabor da Terra', 'Café do Campus', 'Cantina da Medicina',
    'Restaurante Mandacaru', 'Cantina da Biblioteca', 'Lanchonete Praça Verde',
  ]
  const halls = hallNames.map((name, i) => ({
    id: id('hall', i),
    name,
    type: i < 3 ? DiningHallType.CANTEEN : at([DiningHallType.CANTEEN, DiningHallType.RESTAURANT, DiningHallType.CAFE], i),
    canteen: i < 6 ? name : null,
    storeNumber: String(10 + i),
    postalCode: `600${10 + i}-000`,
    latitude: -3.7400 - i * 0.004,
    longitude: -38.5400 + i * 0.003,
    openingHours: {
      mon_fri: { open: '07:00', close: i % 3 === 0 ? '20:00' : '18:00' },
      sat: { open: '08:00', close: '14:00' },
      sun: null,
    },
  }))
  await prisma.diningHall.createMany({ data: halls })

  // owners (12), supervisors (12), followers (24)
  const memberRows: { userId: string; diningHallId: string; relation: MemberRelation }[] = []
  const seen = new Set<string>()
  const addMember = (userId: string, diningHallId: string, relation: MemberRelation) => {
    const k = `${userId}|${diningHallId}|${relation}`
    if (seen.has(k)) return
    seen.add(k)
    memberRows.push({ userId, diningHallId, relation })
  }
  halls.forEach((h, i) => {
    addMember(owners[i % 10].id, h.id, MemberRelation.OWNER)
    addMember(owners[(i + 5) % 10].id, h.id, MemberRelation.SUPERVISOR)
  })
  students.forEach((s, i) => {
    addMember(s.id, halls[i % 12].id, MemberRelation.FOLLOWER)
    addMember(s.id, halls[(i + 3) % 12].id, MemberRelation.FOLLOWER)
  })
  await prisma.diningHallMember.createMany({
    data: memberRows.map((m, i) => ({ id: id('mem', i), ...m, createdAt: addD(-60 + i) })),
  })

  // ───────────────────────── INGREDIENTS (15) & ALLERGIES ─────────────────────────
  const ingredientDefs: [string, boolean][] = [
    ['gluten', true], ['milk', true], ['egg', true], ['peanut', true], ['soy', true],
    ['shrimp', true], ['fish', true], ['rice', false], ['beans', false], ['tomato', false],
    ['onion', false], ['chicken', false], ['beef', false], ['lettuce', false], ['cassava', false],
  ]
  const ing = Object.fromEntries(ingredientDefs.map(([n], i) => [n, id('ing', i)]))
  await prisma.ingredient.createMany({
    data: ingredientDefs.map(([name, isAllergen], i) => ({ id: id('ing', i), name, isAllergen })),
  })

  const allergyRows: { userId: string; ingredientId: string }[] = []
  const allergySeen = new Set<string>()
  const addAllergy = (userId: string, ingredientId: string) => {
    const k = userId + ingredientId
    if (allergySeen.has(k)) return
    allergySeen.add(k)
    allergyRows.push({ userId, ingredientId })
  }
  students.forEach((s, i) => addAllergy(s.id, id('ing', i % 7)))
  ;[0, 3, 6, 9].forEach((i) => addAllergy(students[i].id, id('ing', (i + 3) % 7)))
  await prisma.userAllergy.createMany({ data: allergyRows })

  // ───────────────────────── FOOD ITEMS (24) ─────────────────────────
  const menuPool = [
    { name: 'Prato feito de frango', category: 'rice_beans', price: 1800, grams: 450, ings: ['rice', 'beans', 'chicken'] },
    { name: 'Macarrão à bolonhesa', category: 'pasta', price: 1600, grams: 400, ings: ['gluten', 'beef', 'tomato', 'onion'] },
    { name: 'Salada completa', category: 'vegetables', price: 1400, grams: 300, ings: ['lettuce', 'tomato', 'onion'] },
    { name: 'Pão de queijo', category: 'bread', price: 600, grams: 80, ings: ['milk', 'egg', 'cassava'] },
    { name: 'Omelete de queijo', category: 'dairy', price: 1200, grams: 220, ings: ['egg', 'milk'] },
    { name: 'Vaca atolada', category: 'meat', price: 2000, grams: 450, ings: ['beef', 'cassava'] },
    { name: 'Moqueca de peixe', category: 'meat', price: 2200, grams: 450, ings: ['fish', 'tomato', 'onion'] },
    { name: 'Fruta da estação', category: 'fruit', price: 500, grams: 200, ings: [] as string[] },
    { name: 'Sanduíche natural', category: 'snack', price: 900, grams: 220, ings: ['gluten', 'chicken', 'lettuce'] },
    { name: 'Pudim de leite', category: 'dessert', price: 700, grams: 120, ings: ['milk', 'egg'] },
    { name: 'Paçoca', category: 'dessert', price: 400, grams: 60, ings: ['peanut'] },
    { name: 'Pastel de camarão', category: 'snack', price: 1000, grams: 150, ings: ['gluten', 'shrimp', 'soy'] },
  ]
  const foodItems = range(24).map((n) => {
    const p = at(menuPool, n)
    return {
      id: id('food', n),
      diningHallId: halls[Math.floor(n / 2)].id,
      name: p.name,
      basePriceCents: p.price + (n >= 12 ? 100 : 0),
      category: p.category,
      unitWeightGrams: p.grams,
      ings: p.ings,
    }
  })
  await prisma.foodItem.createMany({
    data: foodItems.map(({ ings, ...f }, n) => ({ ...f, isActive: true, createdAt: addD(-90 + n) })),
  })
  await prisma.foodItemIngredient.createMany({
    data: foodItems.flatMap((f) => f.ings.map((n) => ({ foodItemId: f.id, ingredientId: ing[n] }))),
  })

  // ───────────────────────── LISTINGS (24) ─────────────────────────
  const listings = foodItems.map((f, n) => {
    const discountRate = at([0.3, 0.4, 0.5, 0.6], n)
    const quantityTotal = 6 + (n % 5) * 2
    const status = n % 8 === 6 ? ListingStatus.SOLD_OUT : n % 8 === 7 ? ListingStatus.EXPIRED : ListingStatus.ACTIVE
    const start = status === ListingStatus.EXPIRED ? addH(-8) : addH(2 + (n % 3))
    return {
      id: id('lst', n),
      diningHallId: f.diningHallId,
      createdById: owners[Math.floor(n / 2) % 10].id,
      foodItemId: f.id,
      title: `Sobra do dia: ${f.name}`,
      description: `${f.name} preparado hoje, disponível com desconto até o fim do expediente.`,
      category: f.category,
      unitWeightGrams: f.unitWeightGrams,
      originalPriceCents: f.basePriceCents,
      priceCents: Math.round(f.basePriceCents * (1 - discountRate)),
      discountRate,
      quantityTotal,
      quantityRemaining: status === ListingStatus.SOLD_OUT ? 0 : quantityTotal - (n % 4),
      pickupWindowStart: start,
      pickupWindowEnd: new Date(start.getTime() + 2 * 3600_000),
      status,
      createdAt: addH(-3 - (n % 5)),
      ings: f.ings,
    }
  })
  await prisma.listing.createMany({ data: listings.map(({ ings, ...l }) => l) })
  await prisma.listingIngredient.createMany({
    data: listings.flatMap((l) => l.ings.map((n) => ({ listingId: l.id, ingredientId: ing[n] }))),
  })

  // ───────────────────────── MEDIA ASSETS (15) ─────────────────────────
  const media = range(15).map((i) => {
    const audio = i % 5 === 4
    return {
      id: id('media', i),
      kind: audio ? MediaKind.AUDIO : MediaKind.IMAGE,
      url: `https://cdn.secondhelping.dev/media/${audio ? 'audio' : 'img'}-${i + 1}.${audio ? 'm4a' : 'jpg'}`,
      uploadedById: owners[i % 10].id,
      diningHallId: halls[i % 12].id,
      foodItemId: i % 3 === 0 ? foodItems[i].id : null,
      listingId: i < 10 ? listings[i].id : null,
      createdAt: addH(-5 - i),
    }
  })
  await prisma.mediaAsset.createMany({ data: media })

  // ───────────────────────── ORDERS (20), ITEMS (24), PAYMENTS (20) ─────────────────────────
  const orderStatuses = [
    OrderStatus.PICKED_UP, OrderStatus.PICKED_UP, OrderStatus.CONFIRMED, OrderStatus.READY_FOR_PICKUP,
    OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT, OrderStatus.NO_SHOW, OrderStatus.EXPIRED,
  ]
  const PLATFORM_FEE = 50
  const SERVICE_FEE = 30
  let itemCounter = 0
  const orders = range(20).map((i) => {
    const h = i % 12
    const listingIdx = [h * 2 + (i % 2)]
    if (i < 4) listingIdx.push(h * 2 + 1 - (i % 2))
    const items = listingIdx.map((li) => {
      const l = listings[li]
      return {
        id: id('oi', itemCounter++),
        listingId: l.id,
        listing: l,
        quantity: 1 + (i % 3),
        originalPriceCents: l.originalPriceCents, // unit price
        discountRate: l.discountRate,
        finalPriceCents: l.priceCents, // unit price after discount
      }
    })
    const subtotal = items.reduce((s, it) => s + it.finalPriceCents * it.quantity, 0)
    const status = at(orderStatuses, i)
    return {
      id: id('ord', i),
      studentId: students[i % 12].id,
      diningHallId: halls[h].id,
      platformFeeCents: PLATFORM_FEE,
      serviceFeeCents: SERVICE_FEE,
      totalCents: subtotal + PLATFORM_FEE + SERVICE_FEE,
      pickupCode: `SH-${String(4821 + i * 137).padStart(5, '0')}`,
      status,
      pickupWindowStart: items[0].listing.pickupWindowStart,
      pickupWindowEnd: items[0].listing.pickupWindowEnd,
      pickedUpAt: status === OrderStatus.PICKED_UP ? addH(-1 - i) : null,
      createdAt: addH(-6 - i),
      items,
    }
  })
  await prisma.order.createMany({ data: orders.map(({ items, ...o }) => o) })
  const orderItems = orders.flatMap((o) => o.items)
  await prisma.orderItem.createMany({
    data: orderItems.map(({ listing, ...it }, k) => ({ ...it, orderId: orders.find((o) => o.items.some((x) => x.id === it.id))!.id })),
  })
  await prisma.payment.createMany({
    data: orders.map((o, i) => {
      const paid: PaymentStatus =
        o.status === OrderStatus.PENDING_PAYMENT ? PaymentStatus.PENDING
        : o.status === OrderStatus.CANCELLED ? PaymentStatus.REFUNDED
        : o.status === OrderStatus.EXPIRED ? PaymentStatus.FAILED
        : PaymentStatus.PAID
      return {
        id: id('pay', i),
        orderId: o.id,
        method: at([PaymentMethod.PIX, PaymentMethod.CREDIT_CARD, PaymentMethod.DEBIT_CARD, PaymentMethod.WALLET], i),
        amountCents: o.totalCents,
        status: paid,
        externalGatewayId: paid === PaymentStatus.PENDING ? null : `gw_${createHash('md5').update(o.id).digest('hex').slice(0, 14)}`,
        paidAt: paid === PaymentStatus.PAID || paid === PaymentStatus.REFUNDED ? addH(-5 - i) : null,
        createdAt: addH(-6 - i),
      }
    }),
  })

  // ───────────────────────── REPORTS (12) ─────────────────────────
  const subjectTypes = [ReportSubjectType.USER, ReportSubjectType.DINING_HALL, ReportSubjectType.LISTING, ReportSubjectType.ORDER]
  const reportStates = [ReportState.OPEN, ReportState.IN_REVIEW, ReportState.RESOLVED, ReportState.DISMISSED]
  const reportTexts = [
    'Pedido retirado, mas a comida estava diferente da descrição.',
    'Local fechado no horário de retirada informado.',
    'Alérgeno não informado na oferta.',
    'Preço cobrado diferente do exibido no app.',
  ]
  await prisma.report.createMany({
    data: range(12).map((i) => {
      const type = at(subjectTypes, i)
      const state = at(reportStates, i)
      const subjectId =
        type === ReportSubjectType.USER ? owners[i % 10].id
        : type === ReportSubjectType.DINING_HALL ? halls[i % 12].id
        : type === ReportSubjectType.LISTING ? listings[i].id
        : orders[i].id
      return {
        id: id('rep', i),
        reporterId: students[i % 12].id,
        handledById: state === ReportState.OPEN ? null : moderators[i % 10].id,
        orderId: type === ReportSubjectType.ORDER ? orders[i].id : null,
        subjectType: type,
        subjectId,
        state,
        content: at(reportTexts, i),
        createdAt: addD(-10 + i),
      }
    }),
  })

  // ───────────────────────── AI: MODEL VERSIONS (6 modules × 2) ─────────────────────────
  const modules = [
    ModelModule.SURPLUS_ENGINE, ModelModule.PREP_COPILOT, ModelModule.LISTING_COPILOT,
    ModelModule.DYNAMIC_PRICING, ModelModule.RESCUE_ROUTER, ModelModule.IMPACT_ESTIMATOR,
  ]
  const moduleNames = ['surplus-gbm', 'prep-twin', 'listing-vlm', 'pricing-bandit', 'rescue-ranker', 'impact-calc']
  const modelVersions = modules.flatMap((module, m) =>
    [0, 1].map((k) => ({
      id: id('mv', m * 2 + k),
      module,
      name: moduleNames[m],
      version: k === 0 ? '1.0.0' : '1.1.0',
      metrics: m === 0 ? { mae: k === 0 ? 2.9 : 2.3, coverage90: k === 0 ? 0.84 : 0.9 } : { score: k === 0 ? 0.78 : 0.83 },
      trainedAt: addD(-30 + k * 14),
      isActive: k === 1,
    })),
  )
  await prisma.modelVersion.createMany({ data: modelVersions })
  const mv = (m: number, k: number) => id('mv', m * 2 + k)

  // ───────────────────────── AI: CAMPUS EVENTS (10), WEATHER (12) ─────────────────────────
  const eventDefs: [string, CampusEventKind][] = [
    ['Semana de recepção dos calouros', CampusEventKind.EVENT],
    ['Provas da primeira avaliação', CampusEventKind.EXAM],
    ['Feriado de Finados', CampusEventKind.HOLIDAY],
    ['Bloco de aulas de Engenharia', CampusEventKind.CLASS_BLOCK],
    ['Feira de Ciências', CampusEventKind.EVENT],
    ['Provas finais', CampusEventKind.EXAM],
    ['Recesso de fim de ano', CampusEventKind.HOLIDAY],
    ['Bloco de aulas de Medicina', CampusEventKind.CLASS_BLOCK],
    ['Festival cultural universitário', CampusEventKind.EVENT],
    ['Semana de Tecnologia', CampusEventKind.EVENT],
  ]
  const events = eventDefs.map(([name, kind], i) => ({
    id: id('evt', i),
    name,
    kind,
    location: at(['Campus Benfica', 'Campus Pici', 'Campus Porangabuçu'], i),
    expectedAttendance: 200 + i * 350,
    startsAt: addD(i * 3 - 4),
    endsAt: addD(i * 3 - 3),
  }))
  await prisma.campusEvent.createMany({ data: events })
  await prisma.weatherObservation.createMany({
    data: halls.map((h, i) => ({
      id: id('wx', i),
      diningHallId: h.id,
      observedAt: addH(-i),
      temperatureC: 27 + (i % 7),
      precipitation: i % 4 === 0 ? 4.5 : 0,
      condition: at(['sunny', 'partly_cloudy', 'rain', 'cloudy'], i),
    })),
  })

  // ───────────────────────── AI: DAILY PRODUCTION (20), FORECASTS (20), PREP RECS (20) ─────────────────────────
  await prisma.dailyProduction.createMany({
    data: range(20).map((i) => {
      const f = foodItems[(i * 5) % 24]
      const prepared = 50 + (i % 6) * 10
      const sold = prepared - 3 - (i % 7)
      const leftover = prepared - sold
      return {
        id: id('dp', i),
        diningHallId: f.diningHallId,
        foodItemId: f.id,
        date: day(-1 - i),
        mealPeriod: MealPeriod.LUNCH,
        plannedQty: prepared - 2,
        preparedQty: prepared,
        soldQty: sold,
        leftoverQty: leftover,
        wasteKg: Math.round(leftover * f.unitWeightGrams * 0.6) / 1000,
      }
    }),
  })

  const forecastIds = range(20).map((i) => id('fc', i))
  await prisma.surplusForecast.createMany({
    data: forecastIds.map((fid, i) => {
      const f = foodItems[(i * 7) % 24]
      const expected = 3 + (i % 7) * 1.5
      return {
        id: fid,
        diningHallId: f.diningHallId,
        foodItemId: f.id,
        modelVersionId: mv(0, i % 2),
        targetDate: day(1 + (i % 5)),
        mealPeriod: at([MealPeriod.LUNCH, MealPeriod.DINNER, MealPeriod.SNACK], i),
        expectedSurplus: expected,
        ciLow: Math.max(0, expected - 2),
        ciHigh: expected + 2.5,
        features: { weekday: (i % 5) + 1, rain: i % 4 === 0, eventsNearby: i % 3, lag7Sales: 40 + i },
        createdAt: addH(-2),
      }
    }),
  })
  // implicit N:N (Influences)
  for (let i = 0; i < forecastIds.length; i++) {
    await prisma.surplusForecast.update({
      where: { id: forecastIds[i] },
      data: { events: { connect: [{ id: events[i % 10].id }, { id: events[(i + 3) % 10].id }] } },
    })
  }

  await prisma.prepRecommendation.createMany({
    data: forecastIds.map((fid, i) => {
      const status = at([RecommendationStatus.ACCEPTED, RecommendationStatus.PENDING, RecommendationStatus.REJECTED], i)
      return {
        id: id('prep', i),
        forecastId: fid,
        decidedById: status === RecommendationStatus.PENDING ? null : owners[i % 10].id,
        recommendedQty: 40 + (i % 6) * 8,
        currentPlannedQty: 50 + (i % 6) * 10,
        status,
        decidedAt: status === RecommendationStatus.PENDING ? null : addH(-1 - i),
        createdAt: addH(-3),
      }
    }),
  })

  await prisma.simulationScenario.createMany({
    data: range(10).map((i) => ({
      id: id('sim', i),
      diningHallId: halls[i].id,
      createdById: owners[i].id,
      modelVersionId: mv(1, i % 2),
      params: { reducePrepByPct: 5 + i, menuSwap: i % 2 === 0, weather: at(['sunny', 'rain'], i) },
      results: { expectedWasteKgDelta: -(1.2 + i * 0.3), expectedRevenueDeltaPct: -(0.5 + i * 0.1), stockoutRisk: 0.02 + i * 0.01 },
      createdAt: addH(-i * 4),
    })),
  })

  // ───────────────────────── AI: LISTING DRAFTS (10) ─────────────────────────
  await prisma.listingDraft.createMany({
    data: range(10).map((i) => {
      const m = media[i]
      const voice = m.kind === MediaKind.AUDIO
      const l = listings[i]
      return {
        id: id('draft', i),
        createdById: m.uploadedById,
        diningHallId: m.diningHallId,
        mediaAssetId: m.id,
        modelVersionId: mv(2, i % 2),
        listingId: i < 6 ? l.id : null,
        sourceType: voice ? DraftSource.VOICE : DraftSource.PHOTO,
        transcript: voice ? `Tenho umas ${l.quantityTotal} porções de ${foodItems[i].name} sobrando, retirada até as 18h.` : null,
        draft: {
          title: l.title,
          description: l.description,
          quantity: l.quantityTotal,
          suggestedDiscountRate: l.discountRate,
          allergens: foodItems[i].ings.filter((n: string) => ingredientDefs.find(([x]) => x === n)?.[1]),
        },
        confidence: 0.72 + (i % 5) * 0.05,
        status: i < 6 ? DraftStatus.APPROVED : at([DraftStatus.PENDING_REVIEW, DraftStatus.DISCARDED], i),
        createdAt: addH(-4 - i),
      }
    }),
  })

  // ───────────────────────── AI: PRICING (policies 12, changes 20, events 40) ─────────────────────────
  await prisma.pricingPolicy.createMany({
    data: halls.map((h, i) => ({
      id: id('pp', i),
      diningHallId: h.id,
      minDiscountRate: 0.2,
      maxDiscountRate: 0.7,
      maxStepRate: 0.1,
      fairnessRules: { noSurgeAfterDiscount: true, maxPriceForLowIncomeCents: 1500, cooldownMinutes: 30 },
      isActive: true,
      createdAt: addD(-20),
    })),
  })
  await prisma.priceChange.createMany({
    data: range(20).map((i) => {
      const li = (i * 5) % 24
      const l = listings[li]
      return {
        id: id('pc', i),
        listingId: l.id,
        policyId: id('pp', Math.floor(li / 2)),
        modelVersionId: mv(3, i % 2),
        oldDiscountRate: Math.max(0.2, l.discountRate - 0.1),
        newDiscountRate: l.discountRate,
        reason: at(['Low demand near pickup deadline', 'High remaining inventory', 'Rain reduced foot traffic', 'Peak interest, hold price'], i),
        signals: { minutesToPickup: 30 + i * 6, views: 10 + i * 3, remaining: l.quantityRemaining },
        createdAt: addH(-1 - i),
      }
    }),
  })
  const eventTypes = [ListingEventType.VIEW, ListingEventType.VIEW, ListingEventType.SAVE, ListingEventType.RESERVE]
  await prisma.listingEvent.createMany({
    data: range(40).map((i) => ({
      id: id('le', i),
      listingId: listings[(i * 7) % 24].id,
      userId: students[i % 12].id,
      type: at(eventTypes, i),
      createdAt: addH(-i),
    })),
  })

  // ───────────────────────── AI: RESCUE ROUTER (destinations 12, dispatches 12) ─────────────────────────
  const destTypes = [
    RescueDestinationType.PANTRY, RescueDestinationType.SHELTER, RescueDestinationType.STAFF_MEAL,
    RescueDestinationType.KITCHEN, RescueDestinationType.COMPOST,
  ]
  const destNames = ['Despensa Solidária Benfica', 'Abrigo Santa Luzia', 'Refeição da Equipe', 'Cozinha Comunitária do Pici',
    'Composteira Campus Verde', 'Banco de Alimentos Fortaleza', 'Abrigo Esperança', 'Refeição da Equipe (Cantina Central)',
    'Cozinha Solidária Aldeota', 'Composteira da Horta Escola', 'Despensa Mãos Dadas', 'Abrigo Casa Amiga']
  const destinations = destNames.map((name, i) => ({
    id: id('dest', i),
    type: at(destTypes, i),
    name,
    address: `Rua ${i + 1}, Fortaleza - CE`,
    latitude: -3.73 - i * 0.005,
    longitude: -38.52 - i * 0.004,
    capacityKg: 15 + i * 5,
    acceptedCategories: at([['rice_beans', 'meat', 'vegetables'], ['pasta', 'bread', 'fruit'], ['snack', 'dessert', 'dairy']], i),
    openingHours: { mon_sat: { open: '08:00', close: '19:00' } },
    isActive: true,
  }))
  await prisma.rescueDestination.createMany({ data: destinations })

  const dispatches = range(12).map((i) => {
    const l = listings[(i * 2) % 24]
    const quantity = 2 + (i % 4)
    return {
      id: id('disp', i),
      listingId: l.id,
      destinationId: destinations[i].id,
      modelVersionId: mv(4, i % 2),
      quantity,
      weightKg: Math.round(quantity * l.unitWeightGrams) / 1000,
      status: at([DispatchStatus.COMPLETED, DispatchStatus.ACCEPTED, DispatchStatus.RECOMMENDED, DispatchStatus.REJECTED], i),
      recommendedAt: addH(-8 - i),
      completedAt: i % 4 === 0 ? addH(-6 - i) : null,
      category: l.category!,
      listing: l,
    }
  })
  await prisma.rescueDispatch.createMany({ data: dispatches.map(({ category, listing, ...d }) => d) })

  // ───────────────────────── AI: IMPACT (factors 10, records 22) ─────────────────────────
  const factorDefs: [string, number, number, number][] = [
    ['rice_beans', 2.7, 1800, 3.2], ['meat', 27.0, 15400, 164], ['pasta', 1.6, 1850, 3.9],
    ['vegetables', 0.5, 320, 0.9], ['bread', 1.3, 1600, 4.1], ['dairy', 3.2, 1000, 8.9],
    ['fruit', 0.7, 960, 0.9], ['snack', 2.0, 1500, 4.0], ['dessert', 2.4, 1300, 5.0], ['beverage', 0.9, 250, 0.7],
  ]
  const factors = factorDefs.map(([category, co2PerKg, waterPerKg, landPerKg], i) => ({
    id: id('ef', i), category, co2PerKg, waterPerKg, landPerKg, source: 'Our World in Data / Poore & Nemecek (2018)', validFrom: day(-300),
  }))
  await prisma.emissionFactor.createMany({ data: factors })
  const factorOf = (cat: string) => factors.find((f) => f.category === cat) ?? factors[0]
  const r2 = (n: number) => Math.round(n * 100) / 100

  const fromOrderItems = orderItems.slice(0, 12).map((it, i) => {
    const f = factorOf(it.listing.category!)
    const kg = (it.quantity * it.listing.unitWeightGrams!) / 1000
    return {
      id: id('imp', i),
      diningHallId: it.listing.diningHallId,
      orderItemId: it.id,
      rescueDispatchId: null,
      emissionFactorId: f.id,
      mealsRescued: it.quantity,
      kgDiverted: r2(kg),
      co2AvoidedKg: r2(kg * f.co2PerKg),
      waterSavedL: r2(kg * f.waterPerKg),
      landSavedM2: r2(kg * f.landPerKg),
      studentSavingsCents: (it.originalPriceCents - it.finalPriceCents) * it.quantity,
      createdAt: addH(-2 - i),
    }
  })
  const fromDispatches = dispatches.slice(0, 10).map((d, i) => {
    const f = factorOf(d.category)
    return {
      id: id('imp', 12 + i),
      diningHallId: d.listing.diningHallId,
      orderItemId: null,
      rescueDispatchId: d.id,
      emissionFactorId: f.id,
      mealsRescued: d.quantity,
      kgDiverted: d.weightKg,
      co2AvoidedKg: r2(d.weightKg * f.co2PerKg),
      waterSavedL: r2(d.weightKg * f.waterPerKg),
      landSavedM2: r2(d.weightKg * f.landPerKg),
      studentSavingsCents: 0,
      createdAt: addH(-3 - i),
    }
  })
  await prisma.impactRecord.createMany({ data: [...fromOrderItems, ...fromDispatches] })

  console.log('Seed completed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())