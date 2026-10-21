import prisma from "@/lib/prisma";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";
import type { ToolDefinition } from "@/lib/ollama";
import type { Allergen, User } from "../app/generated/prisma/client";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const ALLERGENS = new Set(["GLUTEN", "MILK", "EGGS", "FISH", "SHELLFISH", "TREE_NUTS", "PEANUTS", "WHEAT", "SOY", "SESAME"]);

// Tools the chatbot can call. Keep results compact — small local models lose
// track when fed long payloads.
export const chatTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time on the server. Use for any question about the time, today's date, or how long is left before a deadline.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dining_halls",
      description: "List all campus dining halls with their addresses and how many meals each currently has available.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_listings",
      description: "Get meals currently available for reservation: food name, description, allergens, price, discount, remaining quantity, pickup window, and dining hall. Only call this once per question and reason over the results.",
      parameters: {
        type: "object",
        properties: {
          dining_hall: { type: "string", description: "Optional dining hall name (partial match, e.g. 'Main' or '2nd')." },
          exclude_allergens: {
            type: "array",
            items: { type: "string" },
            description: `Optional allergens to exclude, from: ${[...ALLERGENS].join(", ")}.`,
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_orders",
      description: "Get the current user's recent orders: meal, dining hall, status, pickup code (only when reserved), pickup window, and price.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export async function executeChatTool(name: string, args: Record<string, unknown>, user: User): Promise<string> {
  switch (name) {
    case "get_current_time": {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        local: now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }

    case "list_dining_halls": {
      await settleUnavailableOrders();
      const now = new Date();
      const halls = await prisma.diningHall.findMany({
        select: {
          name: true,
          address: true,
          listings: {
            where: { status: "ACTIVE", quantityRemaining: { gt: 0 }, pickupWindowEnd: { gt: now } },
            select: { quantityRemaining: true },
          },
        },
        orderBy: { name: "asc" },
      });
      return JSON.stringify(
        halls.map((hall) => ({
          name: hall.name,
          address: hall.address,
          mealsAvailable: hall.listings.reduce((total, listing) => total + listing.quantityRemaining, 0),
        })),
      );
    }

    case "get_available_listings": {
      await settleUnavailableOrders();
      const now = new Date();
      const hallFilter = typeof args.dining_hall === "string" && args.dining_hall.trim() ? args.dining_hall.trim() : null;
      const excluded = Array.isArray(args.exclude_allergens)
        ? args.exclude_allergens.filter((a): a is string => typeof a === "string" && ALLERGENS.has(a.toUpperCase())).map((a) => a.toUpperCase() as Allergen)
        : [];

      const listings = await prisma.listing.findMany({
        where: {
          status: "ACTIVE",
          quantityRemaining: { gt: 0 },
          pickupWindowEnd: { gt: now },
          ...(hallFilter ? { diningHall: { name: { contains: hallFilter, mode: "insensitive" } } } : {}),
          ...(excluded.length ? { food: { NOT: { allergens: { hasSome: excluded } } } } : {}),
        },
        include: { food: true, diningHall: { select: { name: true } } },
        orderBy: { pickupWindowEnd: "asc" },
        take: 12,
      });

      if (!listings.length) return "No meals match those criteria right now.";
      return JSON.stringify(
        listings.map((listing) => ({
          meal: listing.food.name,
          description: listing.food.description,
          allergens: listing.food.allergens,
          diningHall: listing.diningHall.name,
          price: money(listing.priceCents),
          regularPrice: money(listing.originalPriceCents),
          discount: `${listing.discountRate}% off`,
          remaining: listing.quantityRemaining,
          pickupWindow: `${listing.pickupWindowStart.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} – ${listing.pickupWindowEnd.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
        })),
      );
    }

    case "get_my_orders": {
      const orders = await prisma.order.findMany({
        where: { studentId: user.id },
        include: { listing: { include: { food: { select: { name: true } }, diningHall: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      });
      if (!orders.length) return "This user has no orders yet.";
      return JSON.stringify(
        orders.map((order) => ({
          meal: order.listing.food.name,
          diningHall: order.listing.diningHall.name,
          status: order.status,
          price: money(order.finalPriceCents * order.quantity + order.platformFeeCents + order.serviceFeeCents),
          pickupCode: order.status === "RESERVED" ? order.pickupCode : undefined,
          pickupWindow: `${order.pickupWindowStart.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} – ${order.pickupWindowEnd.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
          pickedUpAt: order.pickedUpAt?.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        })),
      );
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
