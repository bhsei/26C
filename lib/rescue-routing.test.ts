import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRescueRoute, type RescueDestinationCandidate } from "./rescue-routing";

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

test("unsafe-for-donation food is not routed to human-facing destinations", () => {
  const result = evaluateRescueRoute({
    food: { name: "Allergen Mix", safeForConsumption: true, safeForDonation: false, unitWeightKg: 0.6 },
    quantityRemaining: 10,
    estimatedKg: 6,
    minutesUntilDeadline: 120,
    destinations: baseDestinations,
  });

  assert.equal(result.status, "RECOMMENDED");
  assert.equal(result.recommendedDestination?.type, "COMPOST");
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
