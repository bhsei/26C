import test from "node:test";
import assert from "node:assert/strict";
// Run with: npx tsx --test lib/rescue-routing.test.ts
import {
  buildRescueRouteInput,
  evaluateRescueRoute,
  isRescueCandidate,
  rescuableUnits,
  type RescueDestinationCandidate,
  type RescueListing,
} from "./rescue-routing";

const baseDestinations: RescueDestinationCandidate[] = [
  { id: "d1", name: "Campus Pantry", type: "PANTRY", address: "A", capacityKg: 30, active: true },
  { id: "d2", name: "Night Shelter", type: "SHELTER", address: "B", capacityKg: 20, active: true },
  { id: "d3", name: "Staff Kitchen", type: "STAFF_KITCHEN", address: "C", capacityKg: 10, active: true },
  { id: "d4", name: "Dining Hall Compost", type: "COMPOST", address: "D", capacityKg: 80, active: true },
];

test("prefers highest-priority eligible destination", () => {
  const result = evaluateRescueRoute({
    food: { name: "Veg Rice", safeForConsumption: true, safeForDonation: true, unitWeightKg: 0.5 },
    quantityRemaining: 8,
    estimatedKg: 4,
    minutesUntilDeadline: 120,
    destinations: baseDestinations,
  });

  assert.equal(result.status, "RECOMMENDED");
  assert.equal(result.recommendedDestination?.type, "PANTRY");
});

test("unsafe-for-donation food stays in-house instead of going to external donation", () => {
  const result = evaluateRescueRoute({
    food: { name: "Allergen Mix", safeForConsumption: true, safeForDonation: false, unitWeightKg: 0.6 },
    quantityRemaining: 10,
    estimatedKg: 6,
    minutesUntilDeadline: 120,
    destinations: baseDestinations,
  });

  assert.equal(result.status, "RECOMMENDED");
  assert.equal(result.recommendedDestination?.type, "STAFF_KITCHEN");
  assert.ok(result.candidateDestinations.every((d) => d.type !== "PANTRY" && d.type !== "SHELTER"));
});

test("food not safe for consumption only goes to compost", () => {
  const result = evaluateRescueRoute({
    food: { name: "Old Curry", safeForConsumption: false, safeForDonation: true },
    quantityRemaining: 4,
    estimatedKg: 2,
    minutesUntilDeadline: 120,
    destinations: baseDestinations,
  });

  assert.equal(result.recommendedDestination?.type, "COMPOST");
  assert.deepEqual(result.candidateDestinations.map((d) => d.type), ["COMPOST"]);
});

test("zero or negative deadline is treated as expired, not as the default", () => {
  for (const minutesUntilDeadline of [0, -30]) {
    const result = evaluateRescueRoute({
      food: { name: "Rice", safeForConsumption: true, safeForDonation: true },
      quantityRemaining: 4,
      estimatedKg: 2,
      minutesUntilDeadline,
      destinations: baseDestinations,
    });
    assert.equal(result.recommendedDestination?.type, "COMPOST", `deadline ${minutesUntilDeadline}`);
  }
});

test("short deadlines filter out slower operational routes", () => {
  const result = evaluateRescueRoute({
    food: { name: "Noodles", safeForConsumption: true, safeForDonation: true, unitWeightKg: 0.4 },
    quantityRemaining: 5,
    estimatedKg: 2,
    minutesUntilDeadline: 15,
    destinations: baseDestinations,
  });

  assert.equal(result.status, "RECOMMENDED");
  assert.equal(result.recommendedDestination?.type, "COMPOST");
});

test("returns no-feasible route when capacity and fallback are unavailable", () => {
  const result = evaluateRescueRoute({
    food: { name: "Stew", safeForConsumption: true, safeForDonation: true, unitWeightKg: 0.5 },
    quantityRemaining: 40,
    estimatedKg: 20,
    minutesUntilDeadline: 120,
    destinations: [
      { id: "h1", name: "Tiny Pantry", type: "PANTRY", address: null, capacityKg: 5, active: true },
      { id: "h2", name: "Tiny Shelter", type: "SHELTER", address: null, capacityKg: 8, active: true },
      { id: "h3", name: "Closed Compost", type: "COMPOST", address: null, capacityKg: 50, active: false },
    ],
  });

  assert.equal(result.status, "NO_FEASIBLE_DESTINATION");
  assert.equal(result.recommendedDestination, null);
  assert.equal(result.fallbackDestination, null);
});

test("high-impact recommendations require approval", () => {
  const result = evaluateRescueRoute({
    food: { name: "Bulk Rice", safeForConsumption: true, safeForDonation: true, unitWeightKg: 1 },
    quantityRemaining: 12,
    estimatedKg: 12,
    minutesUntilDeadline: 90,
    destinations: baseDestinations,
  });

  assert.equal(result.status, "RECOMMENDED");
  assert.equal(result.requiresApproval, true);
});

test("small compost routes do not need approval", () => {
  const result = evaluateRescueRoute({
    food: { name: "Peels", safeForConsumption: false },
    quantityRemaining: 2,
    estimatedKg: 1,
    minutesUntilDeadline: 10,
    destinations: baseDestinations,
  });

  assert.equal(result.recommendedDestination?.type, "COMPOST");
  assert.equal(result.requiresApproval, false);
});

test("an over-capacity fallback is reported and always requires approval", () => {
  const result = evaluateRescueRoute({
    food: { name: "Stew", safeForConsumption: true, safeForDonation: true },
    quantityRemaining: 40,
    estimatedKg: 20,
    minutesUntilDeadline: 120,
    destinations: [
      { id: "h1", name: "Tiny Pantry", type: "PANTRY", address: null, capacityKg: 5, active: true },
      { id: "c1", name: "Small Compost", type: "COMPOST", address: null, capacityKg: 10, active: true },
    ],
  });

  assert.equal(result.status, "NO_FEASIBLE_DESTINATION");
  assert.equal(result.fallbackDestination?.id, "c1");
  assert.equal(result.requiresApproval, true);
});

test("fallback prefers a disposal path with enough capacity", () => {
  const result = evaluateRescueRoute({
    food: { name: "Rice", safeForConsumption: true, safeForDonation: true },
    quantityRemaining: 4,
    estimatedKg: 2,
    minutesUntilDeadline: 120,
    destinations: [
      ...baseDestinations,
      { id: "o1", name: "Tiny Other", type: "OTHER", address: null, capacityKg: 1, active: true },
      { id: "o2", name: "Big Other", type: "OTHER", address: null, capacityKg: 100, active: true },
    ],
  });

  assert.equal(result.recommendedDestination?.type, "PANTRY");
  assert.equal(result.fallbackDestination?.id, "d4");
});

// --- listing helpers -------------------------------------------------------

const now = new Date("2026-11-21T20:00:00Z");
const minutesFromNow = (m: number) => new Date(now.getTime() + m * 60000);

function listing(overrides: Partial<RescueListing> = {}): RescueListing {
  return {
    status: "ACTIVE",
    quantityTotal: 10,
    quantityRemaining: 4,
    pickupWindowEnd: minutesFromNow(60),
    food: { name: "Veg Rice", category: "COOKED_VEGETARIAN", unitWeightKg: 0.5, allergens: [] },
    orders: [
      { status: "PICKED_UP", quantity: 3 },
      { status: "RESERVED", quantity: 3 },
    ],
    ...overrides,
  };
}

test("open listings only route unclaimed units", () => {
  assert.equal(rescuableUnits(listing(), now), 4);
});

test("closed listings route everything that was not picked up", () => {
  const closed = listing({ status: "EXPIRED", pickupWindowEnd: minutesFromNow(-30) });
  assert.equal(rescuableUnits(closed, now), 7);
  assert.equal(isRescueCandidate(closed, now), true);
});

test("listings closed beyond the lookback window are not offered", () => {
  const old = listing({ status: "EXPIRED", pickupWindowEnd: minutesFromNow(-7 * 60) });
  assert.equal(isRescueCandidate(old, now), false);
});

test("expired listing past safe holding time is routed to compost end-to-end", () => {
  const stale = listing({ status: "EXPIRED", pickupWindowEnd: minutesFromNow(-150) });
  const input = buildRescueRouteInput(stale, baseDestinations, now);
  assert.equal(input.food.safeForConsumption, false);
  assert.equal(evaluateRescueRoute(input).recommendedDestination?.type, "COMPOST");
});

test("allergen-flagged food is kept off external donation end-to-end", () => {
  const input = buildRescueRouteInput(listing({ food: { name: "Pesto Pasta", category: null, unitWeightKg: 0.5, allergens: ["TREE_NUTS"] } }), baseDestinations, now);
  assert.equal(evaluateRescueRoute(input).recommendedDestination?.type, "STAFF_KITCHEN");
});
