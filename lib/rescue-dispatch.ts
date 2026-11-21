import type { Prisma, PrismaClient, RescueDispatch } from "@/app/generated/prisma/client";
import type { RescueDestinationCandidate } from "@/lib/rescue-routing";

// Database helpers for rescue routing. RescueDispatch has no listing column,
// so the link between a dispatch and its listing (and the units it took off
// the marketplace) is recorded in a RESCUE_ROUTE_CREATED ListingEvent. That
// event log is also the audit trail for recommendation and final disposition.

type Db = PrismaClient | Prisma.TransactionClient;

export const RESCUE_EVENT = {
  CREATED: "RESCUE_ROUTE_CREATED",
  NO_DESTINATION: "RESCUE_ROUTE_NO_DESTINATION",
  APPROVED: "RESCUE_ROUTE_APPROVED",
  COMPLETED: "RESCUE_ROUTE_COMPLETED",
  CANCELLED: "RESCUE_ROUTE_CANCELLED",
} as const;

export type RescueCreatedMetadata = {
  dispatchId: string;
  destinationId: string;
  destinationName: string;
  units: number;
  /** Units removed from an open listing's marketplace inventory (restored on cancel). */
  unitsWithdrawnFromSale: number;
  estimatedKg: number;
  dispatchStatus: "PLANNED" | "DISPATCHED";
  recommendationStatus: "RECOMMENDED" | "NO_FEASIBLE_DESTINATION";
  usedFallback: boolean;
  requiresApproval: boolean;
  reason: string;
  explanation: string;
  candidateDestinationIds: string[];
};

/** Window used to count kg already committed to a destination. */
const CAPACITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Active destinations with capacity reduced by kg already planned/dispatched in the last 24 h. */
export async function loadRescueDestinations(db: Db, now: Date): Promise<RescueDestinationCandidate[]> {
  const [destinations, committed] = await Promise.all([
    db.rescueDestination.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.rescueDispatch.groupBy({
      by: ["destinationId"],
      where: { status: { in: ["PLANNED", "DISPATCHED"] }, dispatchedAt: { gte: new Date(now.getTime() - CAPACITY_WINDOW_MS) } },
      _sum: { kgRedistributed: true },
    }),
  ]);
  const committedKg = new Map(committed.map((row) => [row.destinationId, row._sum.kgRedistributed ?? 0]));

  return destinations.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    address: d.address,
    capacityKg: d.capacityKg == null ? null : Math.max(0, d.capacityKg - (committedKg.get(d.id) ?? 0)),
    active: d.active,
  }));
}

function readCreatedMetadata(metadata: Prisma.JsonValue | null): RescueCreatedMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  return typeof value.dispatchId === "string" ? (value as unknown as RescueCreatedMetadata) : null;
}

export type LinkedDispatch = RescueDispatch & { listingId: string; created: RescueCreatedMetadata };

/** Rescue dispatches created for the given listings, newest first. */
export async function getDispatchesForListings(db: Db, listingIds: string[]): Promise<LinkedDispatch[]> {
  if (listingIds.length === 0) return [];
  const events = await db.listingEvent.findMany({
    where: { listingId: { in: listingIds }, eventType: RESCUE_EVENT.CREATED },
    orderBy: { createdAt: "desc" },
  });
  const links = events
    .map((event) => ({ listingId: event.listingId, created: readCreatedMetadata(event.metadata) }))
    .filter((link): link is { listingId: string; created: RescueCreatedMetadata } => !!link.listingId && !!link.created);
  if (links.length === 0) return [];

  const dispatches = await db.rescueDispatch.findMany({ where: { id: { in: links.map((l) => l.created.dispatchId) } } });
  const byId = new Map(dispatches.map((d) => [d.id, d]));
  return links.flatMap((link) => {
    const dispatch = byId.get(link.created.dispatchId);
    return dispatch ? [{ ...dispatch, listingId: link.listingId, created: link.created }] : [];
  });
}

/** True when the listing already has a rescue dispatch that was not cancelled. */
export async function hasOpenRescueDispatch(db: Db, listingId: string) {
  const dispatches = await getDispatchesForListings(db, [listingId]);
  return dispatches.some((d) => d.status !== "CANCELLED");
}

/** The listing link recorded when the dispatch was created, if any (seeded dispatches have none). */
export async function getDispatchLink(db: Db, dispatchId: string) {
  const event = await db.listingEvent.findFirst({
    where: { eventType: RESCUE_EVENT.CREATED, metadata: { path: ["dispatchId"], equals: dispatchId } },
  });
  const created = event ? readCreatedMetadata(event.metadata) : null;
  return event?.listingId && created ? { listingId: event.listingId, created } : null;
}
