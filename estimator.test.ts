// Run with: npx tsx --test lib/impact/estimator.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ImpactEstimator,
  aggregateImpacts,
  isCountableOrder,
  type EmissionFactorInput,
  type OrderImpactInput,
} from "./lib/estimator";

const src = "TEST";
const factors: EmissionFactorInput[] = [
  { id: "EF1", category: "COOKED_MEAT", co2ePerKg: 12, waterLPerKg: 4500, landM2PerKg: 25, source: src, validFrom: new Date("2026-01-01") },
  { id: "EF2", category: "COOKED_MEAT", co2ePerKg: 13.5, waterLPerKg: 4700, landM2PerKg: 26, source: src, validFrom: new Date("2026-11-01") },
  { id: "EF3", category: "COOKED_VEGETARIAN", co2ePerKg: 2.5, waterLPerKg: 500, landM2PerKg: 3, source: src, validFrom: new Date("2026-01-01") },
  { id: "EF9", category: "MIXED_FOOD", co2ePerKg: 3, waterLPerKg: 700, landM2PerKg: 5, source: src, validFrom: new Date("2026-01-01") },
];

const order = (over: Partial<OrderImpactInput> = {}): OrderImpactInput => ({
  orderId: "o1",
  diningHallId: "hall-main",
  quantity: 2,
  originalPriceCents: 1000,
  finalPriceCents: 400,
  pickedUpAt: new Date("2026-10-20T12:00:00Z"),
  food: { id: "f1", category: "COOKED_MEAT", unitWeightKg: 0.5 },
  ...over,
});

test("calculates every metric for a normal order", () => {
  const { metrics, emissionFactorId } = new ImpactEstimator(factors).estimateOrder(order());
  assert.equal(emissionFactorId, "EF1");
  assert.equal(metrics.mealsRescued.value, 2);
  assert.equal(metrics.mealsRescued.basis, "MEASURED");
  assert.equal(metrics.kgDiverted.value, 1);
  assert.equal(metrics.co2Avoided.value, 12);
  assert.equal(metrics.waterSaved.value, 4500);
  assert.equal(metrics.landSaved.value, 25);
  assert.equal(metrics.studentSavings.value, 1200); // (1000-400) x 2
  assert.equal(metrics.co2Avoided.basis, "ESTIMATED");
  assert.equal(metrics.kgDiverted.basis, "ESTIMATED");
});

test("uses the factor valid at pickup time", () => {
  const est = new ImpactEstimator(factors);
  assert.equal(est.estimateOrder(order()).emissionFactorId, "EF1");
  assert.equal(
    est.estimateOrder(order({ pickedUpAt: new Date("2026-11-03T12:00:00Z") })).emissionFactorId,
    "EF2",
  );
});

test("missing category => environmental UNAVAILABLE, meals still counted", () => {
  const { metrics } = new ImpactEstimator(factors).estimateOrder(
    order({ food: { id: "f2", category: null, unitWeightKg: 0.5 } }),
  );
  assert.equal(metrics.co2Avoided.basis, "UNAVAILABLE");
  assert.equal(metrics.co2Avoided.value, null);
  assert.equal(metrics.mealsRescued.value, 2);
  assert.equal(metrics.kgDiverted.value, 1);
});

test("fallback is an ESTIMATE with a documented assumption", () => {
  const { metrics, assumptions } = new ImpactEstimator(factors, { allowFallback: true }).estimateOrder(
    order({ food: { id: "f2", category: null, unitWeightKg: 1 }, quantity: 1 }),
  );
  assert.equal(metrics.co2Avoided.basis, "ESTIMATED");
  assert.equal(metrics.co2Avoided.value, 3);
  assert.ok(assumptions.some((a) => a.startsWith("ASSUMPTION")));
});

test("missing portion weight => kg and environmental metrics UNAVAILABLE", () => {
  const { metrics } = new ImpactEstimator(factors).estimateOrder(
    order({ food: { id: "f3", category: "COOKED_MEAT", unitWeightKg: null } }),
  );
  for (const k of ["kgDiverted", "co2Avoided", "waterSaved", "landSaved"] as const) {
    assert.equal(metrics[k].basis, "UNAVAILABLE");
  }
  assert.equal(metrics.studentSavings.value, 1200);
});

test("student savings are never negative", () => {
  const { metrics } = new ImpactEstimator(factors).estimateOrder(
    order({ originalPriceCents: 500, finalPriceCents: 800 }),
  );
  assert.equal(metrics.studentSavings.value, 0);
});

test("only picked-up, non-refunded orders are countable", () => {
  const d = new Date();
  assert.equal(isCountableOrder({ status: "PICKED_UP", pickedUpAt: d, refundedAt: null }), true);
  assert.equal(isCountableOrder({ status: "PICKED_UP", pickedUpAt: d, refundedAt: d }), false);
  assert.equal(isCountableOrder({ status: "RESERVED", pickedUpAt: null, refundedAt: null }), false);
  assert.equal(isCountableOrder({ status: "CANCELLED", pickedUpAt: null, refundedAt: d }), false);
});

test("duplicate orders are counted once", () => {
  const est = new ImpactEstimator(factors);
  const { impacts, duplicates } = est.estimateOrders([order(), order(), order({ orderId: "o2" })]);
  assert.equal(impacts.length, 2);
  assert.deepEqual(duplicates, ["o1"]);
  const agg = aggregateImpacts([...impacts, impacts[0]]);
  assert.equal(agg.ALL.mealsRescued.total, 4);
});

test("aggregate: coverage, basis and group totals reconcile", () => {
  const est = new ImpactEstimator(factors);
  const { impacts } = est.estimateOrders([
    order({ orderId: "a", diningHallId: "h1" }),
    order({ orderId: "b", diningHallId: "h2", food: { id: "x", category: null, unitWeightKg: 0.4 } }),
    order({ orderId: "c", diningHallId: "h2", food: { id: "y", category: "COOKED_VEGETARIAN", unitWeightKg: 0.4 }, quantity: 1 }),
  ]);
  const agg = aggregateImpacts(impacts);
  assert.equal(agg.ALL.co2Avoided.unavailableCount, 1);
  assert.equal(agg.ALL.co2Avoided.coverage, 2 / 3);
  assert.equal(agg.ALL.co2Avoided.basis, "ESTIMATED");
  assert.equal(agg.ALL.mealsRescued.basis, "MEASURED");
  for (const m of ["mealsRescued", "kgDiverted", "co2Avoided", "studentSavings"] as const) {
    const sum = Object.entries(agg).filter(([k]) => k !== "ALL").reduce((s, [, g]) => s + g[m].total, 0);
    assert.ok(Math.abs(sum - agg.ALL[m].total) < 1e-9);
  }
});
