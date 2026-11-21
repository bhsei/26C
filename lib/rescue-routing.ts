import type { ListingStatus, OrderStatus, RescueDestinationType } from "@/app/generated/prisma/client";

// Pure rescue-routing rules (REQ-FUNC-024). No database access here, so the
// rules can be unit-tested and reused by the merchant page and server actions.

export type RescueDestinationCandidate = {
  id: string;
  name: string;
  type: RescueDestinationType;
  address: string | null;
  /** Remaining capacity in kg; null means unlimited. */
  capacityKg: number | null;
  active: boolean;
};

export interface RescueFoodInput {
  name: string;
  category?: string | null;
  unitWeightKg?: number | null;
  /** Food may still be eaten by people (within safe holding time). */
  safeForConsumption?: boolean;
  /** Food may leave campus as an external donation (pantry/shelter). */
  safeForDonation?: boolean;
}

export interface RescueRouteInput {
  food: RescueFoodInput;
  quantityRemaining: number;
  estimatedKg?: number;
  /**
   * Minutes left before the food must reach its destination. Zero or negative
   * means the safe holding time is over. Omitted means "unknown" (defaults to 120).
   */
  minutesUntilDeadline?: number;
  destinations: RescueDestinationCandidate[];
}

export interface RescueRouteRecommendation {
  status: "RECOMMENDED" | "NO_FEASIBLE_DESTINATION";
  candidateDestinations: RescueDestinationCandidate[];
  recommendedDestination: RescueDestinationCandidate | null;
  fallbackDestination: RescueDestinationCandidate | null;
  requiresApproval: boolean;
  estimatedKg: number;
  minutesUntilDeadline: number;
  reason: string;
  explanation: string;
}

/** Same conservative default meal weight used by the Impact Estimator. */
export const DEFAULT_UNIT_WEIGHT_KG = 0.45;
/** How long cooked food may be held after the pickup window before it is no longer fit for people. */
export const SAFE_HOLDING_MINUTES = 120;
/** How long after a pickup window ends its leftovers are still offered for routing. */
export const RESCUE_LOOKBACK_HOURS = 6;
/** Routes at or above this weight need operator approval. */
export const APPROVAL_KG_THRESHOLD = 8;

const DEFAULT_DEADLINE_MINUTES = 120;

const PRIORITY: Record<RescueDestinationType, number> = {
  PANTRY: 0,
  SHELTER: 1,
  STAFF_KITCHEN: 2,
  COMPOST: 3,
  OTHER: 4,
};

/** Minimum minutes needed to hand food off to each destination type. */
const MIN_HANDOFF_MINUTES: Record<RescueDestinationType, number> = {
  PANTRY: 45,
  SHELTER: 45,
  STAFF_KITCHEN: 20,
  COMPOST: 0,
  OTHER: 0,
};

const isExternalDonation = (type: RescueDestinationType) => type === "PANTRY" || type === "SHELTER";
const isHumanDestination = (type: RescueDestinationType) => isExternalDonation(type) || type === "STAFF_KITCHEN";
const isDisposalPath = (type: RescueDestinationType) => type === "COMPOST" || type === "OTHER";
const byPriority = (a: RescueDestinationCandidate, b: RescueDestinationCandidate) => PRIORITY[a.type] - PRIORITY[b.type];

function finiteOr(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function evaluateRescueRoute(input: RescueRouteInput): RescueRouteRecommendation {
  const minutesUntilDeadline = finiteOr(input.minutesUntilDeadline, DEFAULT_DEADLINE_MINUTES);
  // Past the safe holding time, food is never routed to people, whatever the caller says.
  const safeForHuman = input.food.safeForConsumption !== false && minutesUntilDeadline > 0;
  const safeForDonation = safeForHuman && input.food.safeForDonation !== false;

  const unitWeightKg = finiteOr(input.food.unitWeightKg, 0) > 0 ? input.food.unitWeightKg! : DEFAULT_UNIT_WEIGHT_KG;
  const providedKg = finiteOr(input.estimatedKg, 0);
  const estimatedKg = providedKg > 0 ? providedKg : Math.max(0.1, input.quantityRemaining * unitWeightKg);

  const usable = input.destinations.filter(
    (destination) => destination.active && (destination.capacityKg == null || destination.capacityKg > 0),
  );

  const eligible: Array<{ destination: RescueDestinationCandidate; reason: string }> = [];
  for (const destination of usable) {
    const capacityKg = destination.capacityKg ?? Number.POSITIVE_INFINITY;
    if (capacityKg < estimatedKg) continue;
    if (isHumanDestination(destination.type) && !safeForHuman) continue;
    if (isExternalDonation(destination.type) && !safeForDonation) continue;
    // Disposal paths have no handoff window: expired food can still be composted.
    if (isHumanDestination(destination.type) && minutesUntilDeadline < MIN_HANDOFF_MINUTES[destination.type]) continue;

    const capacityText = Number.isFinite(capacityKg) ? `${capacityKg.toFixed(1)} kg of remaining capacity` : "no capacity limit";
    eligible.push({
      destination,
      reason: isHumanDestination(destination.type)
        ? `${destination.name} can take ${estimatedKg.toFixed(1)} kg for people: safety checks passed, it has ${capacityText}, and ${Math.round(minutesUntilDeadline)} minutes remain for handoff.`
        : `${destination.name} can take ${estimatedKg.toFixed(1)} kg (${capacityText}) within current operational constraints.`,
    });
  }

  eligible.sort((a, b) => byPriority(a.destination, b.destination));
  const recommendedDestination = eligible[0]?.destination ?? null;

  // Fallback: the best disposal pathway other than the recommendation.
  // Prefer one with enough capacity; otherwise any configured disposal path.
  const disposal = usable.filter((d) => isDisposalPath(d.type) && d.id !== recommendedDestination?.id).sort(byPriority);
  const fallbackDestination =
    disposal.find((d) => d.capacityKg == null || d.capacityKg >= estimatedKg) ?? disposal[0] ?? null;

  if (!recommendedDestination) {
    const reason = !safeForHuman
      ? "The food is past its safe holding time or not fit for people, and no disposal pathway has enough capacity."
      : "No destination met the safety, capacity, timing, and operational constraints.";

    return {
      status: "NO_FEASIBLE_DESTINATION",
      candidateDestinations: [],
      recommendedDestination: null,
      fallbackDestination,
      // A fallback that failed the checks must never be dispatched without an operator.
      requiresApproval: fallbackDestination != null,
      estimatedKg,
      minutesUntilDeadline,
      reason,
      explanation: fallbackDestination
        ? `${fallbackDestination.name} is the configured fallback pathway, but it did not pass every check (for example capacity), so an operator must approve it.`
        : "No feasible route exists and no fallback pathway is configured.",
    };
  }

  const factors = [
    !safeForHuman ? "food is no longer fit for people" : !safeForDonation ? "food cannot leave campus as a donation" : "safety and handling checks passed",
    `${estimatedKg.toFixed(1)} kg to move`,
    `${Math.round(minutesUntilDeadline)} minutes of safe handling time left`,
  ];
  const explanation = `${recommendedDestination.name} is the highest-priority destination that passed every check (${factors.join("; ")}).`;

  const requiresApproval =
    estimatedKg >= APPROVAL_KG_THRESHOLD ||
    isExternalDonation(recommendedDestination.type) ||
    (isHumanDestination(recommendedDestination.type) && minutesUntilDeadline < 60);

  return {
    status: "RECOMMENDED",
    candidateDestinations: eligible.map((entry) => entry.destination),
    recommendedDestination,
    fallbackDestination,
    requiresApproval,
    estimatedKg,
    minutesUntilDeadline,
    reason: eligible[0].reason,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Listing → routing input helpers
// ---------------------------------------------------------------------------

export type RescueListing = {
  status: ListingStatus;
  quantityTotal: number;
  quantityRemaining: number;
  pickupWindowEnd: Date;
  food: {
    name: string;
    category: string | null;
    unitWeightKg: number | null;
    allergens: readonly string[];
  };
  orders: ReadonlyArray<{ status: OrderStatus; quantity: number }>;
};

/** The pickup window is still running and the listing is on sale or sold out. */
export function isListingOpen(listing: Pick<RescueListing, "status" | "pickupWindowEnd">, now: Date) {
  return (listing.status === "ACTIVE" || listing.status === "SOLD_OUT") && listing.pickupWindowEnd > now;
}

/**
 * Units that can be routed right now.
 * - Open listing: only unclaimed units (reserved meals still belong to students).
 * - Closed listing (expired/withdrawn/window over): everything not picked up.
 */
export function rescuableUnits(listing: RescueListing, now: Date) {
  if (isListingOpen(listing, now)) return Math.max(0, listing.quantityRemaining);
  const pickedUp = listing.orders.filter((o) => o.status === "PICKED_UP").reduce((sum, o) => sum + o.quantity, 0);
  return Math.max(0, listing.quantityTotal - pickedUp);
}

/** Whether a listing should be offered for rescue routing. */
export function isRescueCandidate(listing: RescueListing, now: Date) {
  if (rescuableUnits(listing, now) <= 0) return false;
  if (isListingOpen(listing, now)) return true;
  const lookbackStart = now.getTime() - RESCUE_LOOKBACK_HOURS * 60 * 60 * 1000;
  return listing.pickupWindowEnd.getTime() >= lookbackStart;
}

export function buildRescueRouteInput(
  listing: RescueListing,
  destinations: RescueDestinationCandidate[],
  now: Date,
): RescueRouteInput {
  const units = rescuableUnits(listing, now);
  const unitWeightKg = listing.food.unitWeightKg && listing.food.unitWeightKg > 0 ? listing.food.unitWeightKg : DEFAULT_UNIT_WEIGHT_KG;
  // Handoff deadline = end of pickup window + safe holding time.
  const minutesUntilDeadline = (listing.pickupWindowEnd.getTime() + SAFE_HOLDING_MINUTES * 60000 - now.getTime()) / 60000;

  return {
    food: {
      name: listing.food.name,
      category: listing.food.category,
      unitWeightKg,
      safeForConsumption: minutesUntilDeadline > 0,
      // Allergen labelling cannot be guaranteed once food leaves campus, so
      // allergen-flagged food stays in-house (staff kitchen) or goes to compost.
      safeForDonation: listing.food.allergens.length === 0,
    },
    quantityRemaining: units,
    estimatedKg: units * unitWeightKg,
    minutesUntilDeadline,
    destinations,
  };
}
