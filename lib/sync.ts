/**
 * Prisma layer for the Impact Estimator.
 *
 *  - syncImpactRecords(): turns picked-up orders into ImpactRecord rows.
 *    Idempotent: upserts on (orderId, methodVersion), so running it twice
 *    (or concurrently with a cron job) never double counts.
 *  - getImpactReport(): aggregates stored ImpactRecord rows.
 */
import type { Prisma, PrismaClient } from "../app/generated/prisma/client";
import {
  ImpactEstimator,
  METHOD_VERSION,
  aggregateImpacts,
  isCountableOrder,
  type ImpactMetrics,
  type Metric,
  type MetricBasis,
  type OrderImpact,
} from "./estimator";

export interface SyncOptions {
  from?: Date;
  to?: Date;
  allowFallback?: boolean;
}

export async function syncImpactRecords(prisma: PrismaClient, opts: SyncOptions = {}) {
  const factors = await prisma.emissionFactor.findMany();
  const estimator = new ImpactEstimator(factors, { allowFallback: opts.allowFallback });

  const orders = await prisma.order.findMany({
    where: {
      status: "PICKED_UP",
      refundedAt: null,
      pickedUpAt: {
        not: null,
        ...(opts.from ? { gte: opts.from } : {}),
        ...(opts.to ? { lte: opts.to } : {}),
      },
    },
    include: { listing: { include: { food: true } } },
  });

  const { impacts } = estimator.estimateOrders(
    orders
      .filter(isCountableOrder)
      .map((o) => ({
        orderId: o.id,
        diningHallId: o.listing.diningHallId,
        quantity: o.quantity,
        originalPriceCents: o.originalPriceCents,
        finalPriceCents: o.finalPriceCents,
        pickedUpAt: o.pickedUpAt!,
        food: {
          id: o.listing.food.id,
          category: o.listing.food.category,
          unitWeightKg: o.listing.food.unitWeightKg,
        },
      })),
  );

  const CHUNK = 50;
  for (let i = 0; i < impacts.length; i += CHUNK) {
    await prisma.$transaction(
      impacts.slice(i, i + CHUNK).map((impact) => {
        const data = toRow(impact);
        return prisma.impactRecord.upsert({
          where: { orderId_methodVersion: { orderId: impact.orderId, methodVersion: METHOD_VERSION } },
          create: data,
          update: data,
        });
      }),
    );
  }

  // Orders that later stopped qualifying (e.g. refunded) must stop counting.
  const removed = await prisma.impactRecord.deleteMany({
    where: {
      methodVersion: METHOD_VERSION,
      order: { is: { OR: [{ status: { not: "PICKED_UP" } }, { refundedAt: { not: null } }] } },
    },
  });

  return { upserted: impacts.length, removed: removed.count };
}

export interface ReportFilters {
  from?: Date;
  to?: Date;
  diningHallId?: string;
}

export async function getImpactReport(prisma: PrismaClient, filters: ReportFilters = {}) {
  const rows = await prisma.impactRecord.findMany({
    where: {
      methodVersion: METHOD_VERSION,
      ...(filters.diningHallId ? { diningHallId: filters.diningHallId } : {}),
      ...(filters.from || filters.to
        ? {
            occurredAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
  });

  const notes = (r: (typeof rows)[number]) => (r.notes ?? {}) as Record<string, string>;
  const m = (value: number | null, basis: MetricBasis, note: string | undefined): Metric => ({
    value,
    basis,
    note: note ?? "",
  });

  return {
    methodVersion: METHOD_VERSION,
    aggregates: aggregateImpacts(
      rows.map((r) => ({
        orderId: r.orderId,
        diningHallId: r.diningHallId,
        metrics: {
          mealsRescued: m(r.mealsRescued, "MEASURED", notes(r).mealsRescued),
          kgDiverted: m(r.kgDiverted, r.kgDivertedBasis, notes(r).kgDiverted),
          co2Avoided: m(r.co2AvoidedKg, r.co2AvoidedBasis, notes(r).co2Avoided),
          waterSaved: m(r.waterSavedL, r.waterSavedBasis, notes(r).waterSaved),
          landSaved: m(r.landSavedM2, r.landSavedBasis, notes(r).landSaved),
          studentSavings: m(r.studentSavingsCents, r.studentSavingsBasis, notes(r).studentSavings),
        } satisfies ImpactMetrics,
      })),
    ),
  };
}

function toRow(i: OrderImpact) {
  const k = i.metrics;
  const notes: Record<string, string> = {};
  for (const [name, metric] of Object.entries(k)) notes[name] = metric.note;
  return {
    orderId: i.orderId,
    diningHallId: i.diningHallId,
    occurredAt: i.occurredAt,
    category: i.category,
    emissionFactorId: i.emissionFactorId,
    methodVersion: i.methodVersion,
    mealsRescued: k.mealsRescued.value ?? 0,
    kgDiverted: k.kgDiverted.value,
    kgDivertedBasis: k.kgDiverted.basis,
    co2AvoidedKg: k.co2Avoided.value,
    co2AvoidedBasis: k.co2Avoided.basis,
    waterSavedL: k.waterSaved.value,
    waterSavedBasis: k.waterSaved.basis,
    landSavedM2: k.landSaved.value,
    landSavedBasis: k.landSaved.basis,
    studentSavingsCents: k.studentSavings.value,
    studentSavingsBasis: k.studentSavings.basis,
    assumptions: i.assumptions,
    notes: notes as Prisma.InputJsonValue,
  };
}
