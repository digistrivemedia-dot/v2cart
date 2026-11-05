/**
 * Portfolio analysis: what each funded unit actually did, and how the units of
 * one product add up into a position.
 *
 * Three numbers are easy to conflate, so they're kept distinct throughout:
 *
 *   atRisk      — capital sitting in units that haven't sold yet
 *   realised    — profit from units that HAVE sold (cash that moved)
 *   unrealised  — profit the unsold units are expected to make, not earned yet
 *
 * `amountInvested` is a moving target: a price drop rewrites it in place and
 * refunds the difference (utils/repriceInvestments.js), so "what did I put in"
 * is answered by the current amount plus whatever came back, not by the
 * original figure — which no longer exists anywhere.
 */

import type { MarginTier, MarginBands } from "./metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Phase 21 — `maturing` sits between the other two: the unit HAS sold, but the
 * customer can still send it back, so the money is not the investor's yet.
 *
 *   waiting   funded, nobody has bought it
 *   maturing  bought, inside the return window
 *   sold      bought, window closed, paid out
 */
export type UnitStatus = "waiting" | "maturing" | "sold";

export type InvestmentUnit = {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  status: UnitStatus;
  /** What this unit currently has at stake (after any price-drop refund). */
  amountInvested: number;
  /** What it pays out when it sells. */
  expectedPayout: number;
  /** Capital handed back because the price dropped after funding. */
  refundedTotal: number;
  /** What it has actually paid out so far — 0 while waiting. */
  realisedPayout: number;
  /** expectedPayout − amountInvested. */
  profit: number;
  /** Profit as a % of what's at stake. */
  roi: number;
  investedAt: number;
  soldAt: number | null;
  /** Days held — to the sale if sold, to now if still waiting. */
  heldDays: number;
  /** A refund was owed but the gateway call failed; the platform still owes it. */
  refundFailed: boolean;
  orderStatus: string | null;
  /** When this unit's money is released. Null until the order is delivered. */
  maturesAt: number | null;
  /** The product's return window in days, as sold. */
  returnWindowDays: number | null;
  /**
   * What will land when it matures — computed by the backend with the same
   * rule the real settlement uses, so it is the figure that actually arrives
   * rather than an optimistic forecast. 0 unless maturing.
   */
  pendingPayout: number;
};

export type Position = {
  productId: string;
  productName: string;
  productImage?: string;
  units: InvestmentUnit[];
  unitsTotal: number;
  unitsWaiting: number;
  unitsSold: number;
  /** Phase 21 — sold, but still inside the customer's return window. */
  unitsMaturing: number;
  /** What those maturing units will pay when their windows close. */
  maturingValue: number;
  /**
   * Capital in units that have not been paid out — waiting AND maturing. A
   * maturing unit's capital is genuinely still at risk: a return puts the unit
   * back in the pool to be sold again.
   */
  atRisk: number;
  /** Total currently staked across every unit, sold or not. */
  capitalDeployed: number;
  refundedTotal: number;
  realisedProfit: number;
  unrealisedProfit: number;
  avgBuyPrice: number;
  /** Realised + unrealised, over capital deployed. */
  roi: number;
  firstInvestedAt: number;
  lastInvestedAt: number;
  /** Average days the sold units took to sell. Null if none have sold. */
  avgDaysToSell: number | null;
  /** Longest a still-waiting unit has been held. Null if none waiting. */
  longestWaitDays: number | null;
  /**
   * Margin band of the product behind this position. Not derivable from the
   * investment rows — it is resolved by the API from the product's own rules —
   * so the page attaches it from the investable-products query. Absent means
   * the product is no longer listed, which reads as the lowest band.
   */
  marginTier?: MarginTier;
  /** The product's bands, so the badge's tooltip quotes real numbers. */
  marginBands?: MarginBands;
};

export type PortfolioTotals = {
  unitsTotal: number;
  unitsWaiting: number;
  unitsSold: number;
  unitsMaturing: number;
  maturingValue: number;
  atRisk: number;
  capitalDeployed: number;
  refundedTotal: number;
  realisedProfit: number;
  unrealisedProfit: number;
  /** Realised profit over the capital that was staked on sold units. */
  realisedRoi: number;
  avgDaysToSell: number | null;
  productCount: number;
  refundFailedCount: number;
};

const round2 = (n: number) => Number(n.toFixed(2));

export function toUnit(investment: any, now = Date.now()): InvestmentUnit {
  const product = investment.product;
  const amountInvested = investment.amountInvested ?? 0;
  const expectedPayout = investment.expectedPayout ?? 0;
  const investedAt = new Date(investment.createdAt ?? 0).getTime();
  const soldAt = investment.matchedAt ? new Date(investment.matchedAt).getTime() : null;

  return {
    id: String(investment._id),
    productId: String(typeof product === "object" ? product?._id : product),
    productName: (typeof product === "object" ? product?.name : null) || "Unlisted product",
    productImage:
      typeof product === "object"
        ? product?.images?.find((i: any) => i.isFeatured)?.url || product?.images?.[0]?.url
        : undefined,
    // `state` comes from the backend (settlementStateOf): 'paid' is a real
    // completed sale, 'maturing' is sold-but-still-returnable. Falls back to
    // the old two-way reading so this keeps working against an older API.
    status:
      investment.state === "maturing"
        ? "maturing"
        : investment.status === "matched"
          ? "sold"
          : "waiting",
    amountInvested,
    expectedPayout,
    refundedTotal: investment.refundedTotal ?? 0,
    realisedPayout: investment.realisedPayout ?? 0,
    profit: round2(expectedPayout - amountInvested),
    roi: amountInvested > 0 ? ((expectedPayout - amountInvested) / amountInvested) * 100 : 0,
    investedAt,
    soldAt,
    heldDays: Math.max(0, ((soldAt ?? now) - investedAt) / DAY_MS),
    refundFailed: Boolean(investment.refundFailed),
    orderStatus:
      typeof investment.matchedOrder === "object" ? investment.matchedOrder?.orderStatus ?? null : null,
    maturesAt: investment.maturesAt ? new Date(investment.maturesAt).getTime() : null,
    returnWindowDays: investment.returnWindowDays ?? null,
    pendingPayout: investment.pendingPayout ?? 0,
  };
}

export function buildPositions(investments: any[], now = Date.now()): Position[] {
  const units = investments.map((i) => toUnit(i, now));
  const byProduct = new Map<string, InvestmentUnit[]>();

  for (const unit of units) {
    if (!byProduct.has(unit.productId)) byProduct.set(unit.productId, []);
    byProduct.get(unit.productId)!.push(unit);
  }

  const positions: Position[] = [];

  for (const [productId, group] of byProduct) {
    const sold = group.filter((u) => u.status === "sold");
    const waiting = group.filter((u) => u.status === "waiting");
    const maturing = group.filter((u) => u.status === "maturing");
    // Nothing has been paid on either of these, so they share every
    // "not realised yet" figure. Keeping maturing out of both buckets would
    // drop its capital and its profit out of the totals entirely.
    const unsettled = [...waiting, ...maturing];

    const capitalDeployed = group.reduce((sum, u) => sum + u.amountInvested, 0);
    const atRisk = unsettled.reduce((sum, u) => sum + u.amountInvested, 0);

    // Realised uses what actually paid out. The fallback matters: a unit
    // matched before the ledger carried per-investment rows would otherwise
    // report realisedPayout 0 and show up as a total loss of its capital. A
    // genuinely reversed payout can't reach here — cancelling an order also
    // re-pools the investment, so it goes back to `waiting`.
    const realisedProfit = sold.reduce(
      (sum, u) => sum + ((u.realisedPayout || u.expectedPayout) - u.amountInvested),
      0
    );
    const unrealisedProfit = unsettled.reduce((sum, u) => sum + u.profit, 0);

    const soldDays = sold.map((u) => u.heldDays);
    const waitDays = waiting.map((u) => u.heldDays);

    positions.push({
      productId,
      productName: group[0].productName,
      productImage: group[0].productImage,
      units: [...group].sort((a, b) => b.investedAt - a.investedAt),
      unitsTotal: group.length,
      unitsWaiting: waiting.length,
      unitsSold: sold.length,
      unitsMaturing: maturing.length,
      maturingValue: round2(maturing.reduce((sum, u) => sum + u.pendingPayout, 0)),
      atRisk: round2(atRisk),
      capitalDeployed: round2(capitalDeployed),
      refundedTotal: round2(group.reduce((sum, u) => sum + u.refundedTotal, 0)),
      realisedProfit: round2(realisedProfit),
      unrealisedProfit: round2(unrealisedProfit),
      avgBuyPrice: group.length ? round2(capitalDeployed / group.length) : 0,
      roi: capitalDeployed > 0 ? ((realisedProfit + unrealisedProfit) / capitalDeployed) * 100 : 0,
      firstInvestedAt: Math.min(...group.map((u) => u.investedAt)),
      lastInvestedAt: Math.max(...group.map((u) => u.investedAt)),
      avgDaysToSell: soldDays.length
        ? Number((soldDays.reduce((s, d) => s + d, 0) / soldDays.length).toFixed(1))
        : null,
      longestWaitDays: waitDays.length ? Number(Math.max(...waitDays).toFixed(1)) : null,
    });
  }

  return positions;
}

export function portfolioTotals(positions: Position[]): PortfolioTotals {
  const allUnits = positions.flatMap((p) => p.units);
  const sold = allUnits.filter((u) => u.status === "sold");

  const capitalOnSold = sold.reduce((sum, u) => sum + u.amountInvested, 0);
  const realisedProfit = positions.reduce((sum, p) => sum + p.realisedProfit, 0);
  const soldDays = sold.map((u) => u.heldDays);

  return {
    unitsTotal: allUnits.length,
    unitsWaiting: allUnits.filter((u) => u.status === "waiting").length,
    unitsSold: sold.length,
    unitsMaturing: allUnits.filter((u) => u.status === "maturing").length,
    maturingValue: round2(positions.reduce((sum, p) => sum + p.maturingValue, 0)),
    atRisk: round2(positions.reduce((sum, p) => sum + p.atRisk, 0)),
    capitalDeployed: round2(positions.reduce((sum, p) => sum + p.capitalDeployed, 0)),
    refundedTotal: round2(positions.reduce((sum, p) => sum + p.refundedTotal, 0)),
    realisedProfit: round2(realisedProfit),
    unrealisedProfit: round2(positions.reduce((sum, p) => sum + p.unrealisedProfit, 0)),
    realisedRoi: capitalOnSold > 0 ? (realisedProfit / capitalOnSold) * 100 : 0,
    avgDaysToSell: soldDays.length
      ? Number((soldDays.reduce((s, d) => s + d, 0) / soldDays.length).toFixed(1))
      : null,
    productCount: positions.length,
    refundFailedCount: allUnits.filter((u) => u.refundFailed).length,
  };
}

/** "3 Oct 2026" */
export function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "12 days" / "3.1 months" */
export function formatDuration(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "today";
  if (days < 60) return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
  return `${(days / 30.44).toFixed(1)} months`;
}

/**
 * How much of a return window is left on a unit that has sold.
 *
 * Phase 21. `maturesAt` is the moment the money is released, so this is the
 * wait the investor actually cares about: "In return period" on its own tells
 * them nothing about whether that means tomorrow or next week.
 *
 * Null `maturesAt` is not zero days — it means the order has not been marked
 * delivered yet, so the clock has not started and the honest answer is "we
 * don't know", which the caller renders differently.
 *
 * Rounded UP, because a window closing in six hours is still "1 day left" to
 * someone waiting on it, not "0".
 */
export function returnDaysLeft(maturesAt: number | null, now = Date.now()): number | null {
  if (!maturesAt) return null;
  return Math.max(0, Math.ceil((maturesAt - now) / DAY_MS));
}

/** "4 days left" / "last day" / "releasing now" — the countdown as one phrase. */
export function formatDaysLeft(maturesAt: number | null, now = Date.now()): string {
  const left = returnDaysLeft(maturesAt, now);
  if (left === null) return "awaiting delivery";
  // Already past its window: the money is due and the next release pays it.
  if (left === 0) return "releasing now";
  if (left === 1) return "last day";
  return `${left} days left`;
}
