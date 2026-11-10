/**
 * SecondHelping - Impact Estimator (REQ-FUNC-025)
 *
 * Pure calculation core: no database or Prisma imports, so it is trivial to
 * unit-test. The Prisma layer lives in ./sync.ts.
 *
 * Units
 *   mealsRescued   portions (count)
 *   kgDiverted     kg of food
 *   co2Avoided     kg CO2e
 *   waterSaved     litres
 *   landSaved      m²
 *   studentSavings integer cents
 *
 * Rules
 *   - Every metric carries a basis: MEASURED | ESTIMATED | UNAVAILABLE.
 *   - Missing inputs => UNAVAILABLE with a note (never a silent 0), unless
 *     `allowFallback` is on, in which case a generic factor is used and the
 *     assumption is recorded.
 *   - An order is counted at most once (dedup by orderId).
 */

export const METHOD_VERSION = "impact-v1.0";

export type MetricBasis = "MEASURED" | "ESTIMATED" | "UNAVAILABLE";

export type FoodCategory =
  | "COOKED_MEAT"
  | "COOKED_VEGETARIAN"
  | "FRESH_PRODUCE"
  | "BAKERY_DELI"
  | "DAIRY_BASED"
  | "MIXED_FOOD";

export const METRIC_NAMES = [
  "mealsRescued",
  "kgDiverted",
  "co2Avoided",
  "waterSaved",
  "landSaved",
  "studentSavings",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export interface Metric {
  value: number | null;
  basis: MetricBasis;
  note: string;
}
export type ImpactMetrics = Record<MetricName, Metric>;

export interface EmissionFactorInput {
  id: string;
  category: FoodCategory;
  co2ePerKg: number | null;
  waterLPerKg: number | null;
  landM2PerKg: number | null;
  source: string;
  validFrom: Date;
}

export interface OrderImpactInput {
  orderId: string;
  diningHallId: string;
  quantity: number;
  originalPriceCents: number; // per unit (reference price)
  finalPriceCents: number; // per unit (what the student paid)
  pickedUpAt: Date;
  food: {
    id: string;
    category: FoodCategory | null;
    unitWeightKg: number | null;
  };
}

export interface OrderImpact {
  orderId: string;
  diningHallId: string;
  occurredAt: Date;
  category: FoodCategory | null;
  emissionFactorId: string | null;
  metrics: ImpactMetrics;
  assumptions: string[];
  methodVersion: string;
}

export interface EstimatorOptions {
  /** Use `fallbackCategory` factor when the food's category has none. Default false. */
  allowFallback?: boolean;
  fallbackCategory?: FoodCategory;
}

const unavailable = (note: string): Metric => ({ value: null, basis: "UNAVAILABLE", note });
const round = (n: number, digits = 4) => Number(n.toFixed(digits));

/** Only picked-up, non-refunded orders count as recovered food. */
export function isCountableOrder(o: {
  status: string;
  pickedUpAt: Date | null;
  refundedAt: Date | null;
}): boolean {
  return o.status === "PICKED_UP" && o.pickedUpAt !== null && o.refundedAt === null;
}

export class ImpactEstimator {
  private readonly allowFallback: boolean;
  private readonly fallbackCategory: FoodCategory;

  constructor(
    private readonly factors: EmissionFactorInput[],
    options: EstimatorOptions = {},
  ) {
    this.allowFallback = options.allowFallback ?? false;
    this.fallbackCategory = options.fallbackCategory ?? "MIXED_FOOD";
  }

  /** Newest factor for the category whose validFrom <= `at`. */
  lookupFactor(category: FoodCategory, at: Date): EmissionFactorInput | null {
    let best: EmissionFactorInput | null = null;
    for (const f of this.factors) {
      if (f.category !== category || f.validFrom.getTime() > at.getTime()) continue;
      if (!best || f.validFrom.getTime() > best.validFrom.getTime()) best = f;
    }
    return best;
  }

  private resolveFactor(category: FoodCategory | null, at: Date) {
    if (category) {
      const factor = this.lookupFactor(category, at);
      if (factor) return { factor, note: "" };
    }
    if (this.allowFallback) {
      const factor = this.lookupFactor(this.fallbackCategory, at);
      if (factor) {
        const why = category ? `category ${category}` : "missing category";
        return {
          factor,
          note: `ASSUMPTION: no factor for ${why}; used generic ${this.fallbackCategory} factor ${factor.id}`,
        };
      }
    }
    return {
      factor: null,
      note: category
        ? `no emission factor for category ${category}`
        : "food has no category",
    };
  }

  estimateOrder(input: OrderImpactInput): OrderImpact {
    const { quantity, food } = input;
    const base = {
      orderId: input.orderId,
      diningHallId: input.diningHallId,
      occurredAt: input.pickedUpAt,
      category: food.category,
      methodVersion: METHOD_VERSION,
    };

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const m = unavailable("invalid quantity");
      return {
        ...base,
        emissionFactorId: null,
        assumptions: [],
        metrics: {
          mealsRescued: m, kgDiverted: m, co2Avoided: m,
          waterSaved: m, landSaved: m, studentSavings: m,
        },
      };
    }

    const assumptions: string[] = [];

    // social metric — measured straight from the transaction
    const mealsRescued: Metric = {
      value: quantity, basis: "MEASURED", note: "picked-up quantity",
    };

    // weight — always an estimate: orders carry no scale reading
    let kgDiverted: Metric;
    if (food.unitWeightKg === null || food.unitWeightKg <= 0) {
      kgDiverted = unavailable("portion weight not documented for this food");
    } else {
      kgDiverted = {
        value: round(quantity * food.unitWeightKg),
        basis: "ESTIMATED",
        note: `${quantity} portion(s) x ${food.unitWeightKg} kg reference weight`,
      };
      assumptions.push(`portion weight = ${food.unitWeightKg} kg`);
    }

    // environmental — kg x factor
    let factor: EmissionFactorInput | null = null;
    let env: Pick<ImpactMetrics, "co2Avoided" | "waterSaved" | "landSaved">;
    if (kgDiverted.value === null) {
      const m = unavailable("kgDiverted unavailable");
      env = { co2Avoided: m, waterSaved: m, landSaved: m };
    } else {
      const resolved = this.resolveFactor(food.category, input.pickedUpAt);
      factor = resolved.factor;
      if (!factor) {
        const m = unavailable(resolved.note);
        env = { co2Avoided: m, waterSaved: m, landSaved: m };
      } else {
        if (resolved.note) assumptions.push(resolved.note);
        const kg = kgDiverted.value;
        const f = factor;
        const build = (perKg: number | null, unit: string): Metric =>
          perKg === null
            ? unavailable(`factor ${f.id} has no ${unit} value`)
            : {
                value: round(kg * perKg),
                basis: "ESTIMATED",
                note: `${kg} kg x ${perKg} ${unit}/kg (factor ${f.id}, source: ${f.source})`,
              };
        env = {
          co2Avoided: build(factor.co2ePerKg, "kg CO2e"),
          waterSaved: build(factor.waterLPerKg, "L water"),
          landSaved: build(factor.landM2PerKg, "m2 land"),
        };
      }
    }

    // student savings — (reference price - price paid) x quantity, never < 0
    let studentSavings: Metric;
    if (input.originalPriceCents <= 0 || input.finalPriceCents < 0) {
      studentSavings = unavailable("no valid reference/paid price recorded");
    } else {
      const perUnit = Math.max(input.originalPriceCents - input.finalPriceCents, 0);
      studentSavings = {
        value: perUnit * quantity,
        basis: "ESTIMATED", // reference price = listing's original price, not a market survey
        note: `(${input.originalPriceCents} - ${input.finalPriceCents}) cents x ${quantity}; reference price = listing original price; fees excluded`,
      };
      assumptions.push("student savings use the listing original price as reference");
    }

    return {
      ...base,
      emissionFactorId: factor?.id ?? null,
      metrics: { mealsRescued, kgDiverted, ...env, studentSavings },
      assumptions,
    };
  }

  /** Estimates many orders; each orderId is processed once. */
  estimateOrders(inputs: OrderImpactInput[]) {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const impacts: OrderImpact[] = [];
    for (const input of inputs) {
      if (seen.has(input.orderId)) {
        duplicates.push(input.orderId);
        continue;
      }
      seen.add(input.orderId);
      impacts.push(this.estimateOrder(input));
    }
    return { impacts, duplicates };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────────────────
export interface AggregateMetric {
  total: number;
  availableCount: number;
  unavailableCount: number;
  measuredCount: number;
  estimatedCount: number;
  /** UNAVAILABLE if nothing could be computed; MEASURED only if every value was measured. */
  basis: MetricBasis;
  /** availableCount / (available + unavailable); null when there are no records */
  coverage: number | null;
}
export type AggregateGroup = Record<MetricName, AggregateMetric>;

interface Acc {
  total: number;
  available: number;
  unavailable: number;
  measured: number;
  estimated: number;
}

export interface Aggregatable {
  orderId: string;
  diningHallId: string;
  metrics: ImpactMetrics;
}

/**
 * Groups by dining hall and always adds an "ALL" group.
 * Deduplicates by orderId so the same transaction never counts twice.
 */
export function aggregateImpacts(
  items: Aggregatable[],
  groupBy: "diningHall" | "none" = "diningHall",
): Record<string, AggregateGroup> {
  const accs = new Map<string, Record<MetricName, Acc>>();
  const blank = () =>
    Object.fromEntries(
      METRIC_NAMES.map((n) => [n, { total: 0, available: 0, unavailable: 0, measured: 0, estimated: 0 }]),
    ) as Record<MetricName, Acc>;

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.orderId)) continue;
    seen.add(item.orderId);

    const keys = groupBy === "diningHall" ? [item.diningHallId, "ALL"] : ["ALL"];
    for (const key of keys) {
      if (!accs.has(key)) accs.set(key, blank());
      const group = accs.get(key)!;
      for (const name of METRIC_NAMES) {
        const m = item.metrics[name];
        const a = group[name];
        if (m.value === null) {
          a.unavailable += 1;
          continue;
        }
        a.total += m.value;
        a.available += 1;
        if (m.basis === "MEASURED") a.measured += 1;
        else a.estimated += 1;
      }
    }
  }
  if (!accs.has("ALL")) accs.set("ALL", blank());

  const out: Record<string, AggregateGroup> = {};
  for (const [key, group] of accs) {
    out[key] = Object.fromEntries(
      METRIC_NAMES.map((name) => {
        const a = group[name];
        const n = a.available + a.unavailable;
        const basis: MetricBasis =
          a.available === 0 ? "UNAVAILABLE" : a.estimated === 0 ? "MEASURED" : "ESTIMATED";
        const metric: AggregateMetric = {
          total: round(a.total),
          availableCount: a.available,
          unavailableCount: a.unavailable,
          measuredCount: a.measured,
          estimatedCount: a.estimated,
          basis,
          coverage: n === 0 ? null : a.available / n,
        };
        return [name, metric];
      }),
    ) as AggregateGroup;
  }
  return out;
}
