import type { RescueDestinationType } from "@/app/generated/prisma/client";

export type RescueDestinationCandidate = {
  id: string;
  name: string;
  type: RescueDestinationType;
  address: string | null;
  capacityKg: number | null;
  active: boolean;
};

export interface RescueFoodInput {
  name: string;
  category?: string | null;
  unitWeightKg?: number | null;
  safeForConsumption?: boolean;
  safeForDonation?: boolean;
}

export interface RescueRouteInput {
  food: RescueFoodInput;
  quantityRemaining: number;
  estimatedKg?: number;
  now?: Date;
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
  reason: string;
  explanation: string;
}

const PRIORITY: Record<RescueDestinationType, number> = {
  PANTRY: 0,
  SHELTER: 1,
  STAFF_KITCHEN: 2,
  COMPOST: 3,
  OTHER: 4,
};

function clampPositive(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function evaluateRescueRoute(input: RescueRouteInput): RescueRouteRecommendation {
  const safeForHuman = input.food.safeForConsumption !== false;
  const safeForDonation = input.food.safeForDonation !== false;
  const minutesUntilDeadline = clampPositive(input.minutesUntilDeadline, 120);
  const estimatedKg = clampPositive(
    input.estimatedKg,
    Math.max(0.5, input.quantityRemaining * (input.food.unitWeightKg ?? 0.5)),
  );

  const viableDestinations = input.destinations.filter(
    (destination) => destination.active && (destination.capacityKg == null || destination.capacityKg > 0),
  );

  const eligible: Array<{ destination: RescueDestinationCandidate; reason: string }> = [];

  for (const destination of viableDestinations) {
    const capacityKg = destination.capacityKg ?? Number.POSITIVE_INFINITY;
    const isHumanDestination = destination.type === "PANTRY" || destination.type === "SHELTER" || destination.type === "STAFF_KITCHEN";
    const capacitySufficient = capacityKg >= estimatedKg;
    const operationallyFeasible = destination.type === "PANTRY" || destination.type === "SHELTER"
      ? minutesUntilDeadline >= 45
      : destination.type === "STAFF_KITCHEN"
        ? minutesUntilDeadline >= 20
        : true;

    if (!capacitySufficient) continue;
    if (isHumanDestination && (!safeForHuman || !safeForDonation)) continue;
    if (!operationallyFeasible) continue;

    eligible.push({
      destination,
      reason: isHumanDestination
        ? `${destination.name} is a viable human-facing outlet: safety checks passed, ${capacityKg.toFixed(1)} kg capacity is sufficient, and ${Math.round(minutesUntilDeadline)} minutes remain for handoff.`
        : `${destination.name} can accept ${estimatedKg.toFixed(1)} kg while meeting current operational constraints.`,
    });
  }

  const sortedCandidates = eligible.sort((a, b) => PRIORITY[a.destination.type] - PRIORITY[b.destination.type]);
  const recommendedDestination = sortedCandidates[0]?.destination ?? null;
  const fallbackDestination = viableDestinations
    .filter((destination) => destination.type === "COMPOST" || destination.type === "OTHER")
    .sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type])[0] ?? null;

  if (!recommendedDestination) {
    const reason = safeForHuman && safeForDonation
      ? "No feasible rescue destination met safety, capacity, timing, and operational constraints."
      : "The food does not satisfy the required handling conditions for human donation or consumption, and no suitable fallback route is currently available.";

    return {
      status: "NO_FEASIBLE_DESTINATION",
      candidateDestinations: [],
      recommendedDestination: null,
      fallbackDestination,
      requiresApproval: false,
      estimatedKg,
      reason,
      explanation: fallbackDestination
        ? `No eligible human-facing destination passed the checks, so ${fallbackDestination.name} is the configured fallback pathway.`
        : "No feasible route exists and no configured fallback pathway is available.",
    };
  }

  const explanation = `${recommendedDestination.name} is the best match after applying safety/handling checks, destination capacity, remaining time (${Math.round(minutesUntilDeadline)} minutes), and operational feasibility filters.`;
  const requiresApproval = estimatedKg >= 8 || recommendedDestination.type === "PANTRY" || recommendedDestination.type === "SHELTER" || minutesUntilDeadline < 60;

  return {
    status: "RECOMMENDED",
    candidateDestinations: sortedCandidates.map((entry) => entry.destination),
    recommendedDestination,
    fallbackDestination,
    requiresApproval,
    estimatedKg,
    reason: sortedCandidates[0]?.reason ?? explanation,
    explanation,
  };
}

export async function createRouteDecisionForListing(
  prisma: { rescueDispatch: { create: (args: any) => Promise<any> } },
  input: RescueRouteInput & { diningHallId: string; category?: string | null; dispatchedAt?: Date },
) {
  const recommendation = evaluateRescueRoute(input);
  const targetDestination = recommendation.recommendedDestination ?? recommendation.fallbackDestination ?? input.destinations[0] ?? null;

  if (!targetDestination) return { recommendation, dispatch: null };

  const dispatch = await prisma.rescueDispatch.create({
    data: {
      diningHallId: input.diningHallId,
      destinationId: targetDestination.id,
      category: input.category ?? null,
      dispatchedAt: input.dispatchedAt ?? new Date(),
      kgRedistributed: recommendation.estimatedKg,
      status: recommendation.requiresApproval ? "PLANNED" : "DISPATCHED",
      notes: `${recommendation.reason} ${recommendation.explanation}`,
    },
  });

  return { recommendation, dispatch };
}
