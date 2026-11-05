/**
 * Filtering, banding and summarising for the investor earnings page.
 *
 * The earnings page showed three all-time totals and a breakdown by ledger
 * type, which answers "how much have I made" but not "which of my positions
 * made it". This turns the same positions the portfolio already builds into
 * something an investor can slice: by return band, by whether the money is
 * realised or still at risk, by when it was staked, and by product.
 *
 * Pure functions over `Position[]` (see ./portfolio.ts), so the banding
 * thresholds and the summary arithmetic are checkable — and so the labels in
 * the UI can be generated from the same thresholds the filter uses, rather
 * than hardcoded next to it and drifting.
 */

import type { Position } from "./portfolio";
import type { MarginTier } from "./metrics";

const round2 = (n: number) => Number(n.toFixed(2));
const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------- return bands ----------------------------- */

/**
 * Where one band ends and the next begins, as a percentage return.
 *
 * Exported because the filter labels are derived from these — change a number
 * here and the chip relabels itself instead of lying.
 */
export const ROI_BANDS = { high: 20, mid: 10 } as const;

/** Decimal places the UI shows a return to. Banding uses the same. */
export const ROI_DISPLAY_DP = 1;

/**
 * A return as the investor sees it.
 *
 * Banding MUST use this rather than the raw float. A real position came out
 * at 19.9965% — displayed as "+20.0%", but banded as mid, so a row labelled
 * 20% sat outside the "≥20%" filter and the filter looked broken. Rounding
 * first makes the chip and the row agree by construction.
 */
export const roiAsDisplayed = (roi: number): number => Number(roi.toFixed(ROI_DISPLAY_DP));

/** The return, formatted exactly as it is banded. */
export const formatRoi = (roi: number): string =>
  `${roi >= 0 ? "+" : ""}${roiAsDisplayed(roi).toFixed(ROI_DISPLAY_DP)}%`;

export type RoiBand = "all" | "high" | "mid" | "low" | "negative";

export const roiBandOf = (roi: number): Exclude<RoiBand, "all"> => {
  const shown = roiAsDisplayed(roi);
  if (shown < 0) return "negative";
  if (shown >= ROI_BANDS.high) return "high";
  if (shown >= ROI_BANDS.mid) return "mid";
  return "low";
};

export const ROI_BAND_OPTIONS: { value: RoiBand; label: string }[] = [
  { value: "all", label: "Any return" },
  { value: "high", label: `High (≥${ROI_BANDS.high}%)` },
  { value: "mid", label: `Medium (${ROI_BANDS.mid}–${ROI_BANDS.high}%)` },
  { value: "low", label: `Low (0–${ROI_BANDS.mid}%)` },
  { value: "negative", label: "At a loss (<0%)" },
];

/* --------------------------------- filters -------------------------------- */

export type EarningsStatus = "all" | "realised" | "open";
export type EarningsPeriod = "all" | "30d" | "90d" | "1y";
export type EarningsSort = "profit" | "roi" | "capital" | "fastest" | "recent";

export const STATUS_OPTIONS: { value: EarningsStatus; label: string }[] = [
  { value: "all", label: "All positions" },
  { value: "realised", label: "Paid out" },
  { value: "open", label: "Still waiting" },
];

export const PERIOD_OPTIONS: { value: EarningsPeriod; label: string; days: number | null }[] = [
  { value: "all", label: "All time", days: null },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "1y", label: "Last year", days: 365 },
];

/**
 * Margin band. The dropdown options are built in the page from
 * MARGIN_TIER_ORDER + MARGIN_TIER_META, so a band is labelled identically here
 * and on a product card. This module stays free of runtime imports from
 * ./metrics so it remains self-checkable with node --experimental-strip-types.
 */
export type EarningsTier = MarginTier | "all";

export const SORT_OPTIONS: { value: EarningsSort; label: string }[] = [
  { value: "profit", label: "Highest profit" },
  { value: "roi", label: "Best return %" },
  { value: "capital", label: "Most capital" },
  { value: "fastest", label: "Fastest to sell" },
  { value: "recent", label: "Most recent" },
];

export type EarningsFilters = {
  query: string;
  band: RoiBand;
  status: EarningsStatus;
  period: EarningsPeriod;
  /** Margin band of the product behind the position. */
  tier: EarningsTier;
  sort: EarningsSort;
  /** Custom return range, as typed. Empty string means "no bound". */
  minRoi: string;
  maxRoi: string;
};

export const EMPTY_EARNINGS_FILTERS: EarningsFilters = {
  query: "",
  band: "all",
  status: "all",
  period: "all",
  tier: "all",
  sort: "profit",
  minRoi: "",
  maxRoi: "",
};

/** How many filters are narrowing the list — drives the "clear" affordance. */
export function countActiveEarningsFilters(f: EarningsFilters): number {
  return (
    (f.query.trim() ? 1 : 0) +
    (f.band !== "all" ? 1 : 0) +
    (f.status !== "all" ? 1 : 0) +
    (f.period !== "all" ? 1 : 0) +
    (f.tier !== "all" ? 1 : 0) +
    (f.minRoi.trim() ? 1 : 0) +
    (f.maxRoi.trim() ? 1 : 0) +
    (f.sort !== EMPTY_EARNINGS_FILTERS.sort ? 1 : 0)
  );
}

const periodDays = (period: EarningsPeriod) =>
  PERIOD_OPTIONS.find((p) => p.value === period)?.days ?? null;

export function applyEarningsFilters(
  positions: Position[],
  filters: EarningsFilters,
  now = Date.now()
): Position[] {
  const query = filters.query.trim().toLowerCase();
  const days = periodDays(filters.period);
  const cutoff = days === null ? null : now - days * DAY_MS;

  // Parsed once rather than per row. A blank or non-numeric bound is "no
  // bound" rather than 0, so a half-typed "-" doesn't empty the table.
  const min = filters.minRoi.trim() === "" ? null : Number(filters.minRoi);
  const max = filters.maxRoi.trim() === "" ? null : Number(filters.maxRoi);
  const minRoi = min === null || Number.isNaN(min) ? null : min;
  const maxRoi = max === null || Number.isNaN(max) ? null : max;

  return positions.filter((p) => {
    if (query && !p.productName.toLowerCase().includes(query)) return false;

    // "Paid out" means something actually sold; "still waiting" means capital
    // is still at risk. A position can satisfy both, and should show under
    // either — these are not mutually exclusive states of one position.
    if (filters.status === "realised" && p.unitsSold === 0) return false;
    if (filters.status === "open" && p.unitsWaiting === 0) return false;

    // Dated on the most recent stake: a position topped up last week is
    // recent activity even if it was opened a year ago.
    if (cutoff !== null && p.lastInvestedAt < cutoff) return false;

    if (filters.band !== "all" && roiBandOf(p.roi) !== filters.band) return false;

    // A position on a product that is no longer listed carries no band, so it
    // reads as the lowest rather than dropping out of an unfiltered view — the
    // capital is still in it.
    if (filters.tier !== "all" && (p.marginTier ?? "low") !== filters.tier) return false;

    // Compared as displayed, for the same reason as the bands: typing "20"
    // must include a row the table shows as 20.0%.
    const shownRoi = roiAsDisplayed(p.roi);
    if (minRoi !== null && shownRoi < minRoi) return false;
    if (maxRoi !== null && shownRoi > maxRoi) return false;

    return true;
  });
}

export function applyEarningsSort(positions: Position[], sort: EarningsSort): Position[] {
  const copy = [...positions];
  const totalProfit = (p: Position) => p.realisedProfit + p.unrealisedProfit;

  switch (sort) {
    case "roi":
      return copy.sort((a, b) => b.roi - a.roi);
    case "capital":
      return copy.sort((a, b) => b.capitalDeployed - a.capitalDeployed);
    case "fastest":
      // Positions that have never sold have no speed to rank on, so they sort
      // last rather than appearing to be instant.
      return copy.sort((a, b) => {
        if (a.avgDaysToSell === null && b.avgDaysToSell === null) return 0;
        if (a.avgDaysToSell === null) return 1;
        if (b.avgDaysToSell === null) return -1;
        return a.avgDaysToSell - b.avgDaysToSell;
      });
    case "recent":
      return copy.sort((a, b) => b.lastInvestedAt - a.lastInvestedAt);
    case "profit":
    default:
      return copy.sort((a, b) => totalProfit(b) - totalProfit(a));
  }
}

/* --------------------------------- summary -------------------------------- */

export type EarningsSummary = {
  productCount: number;
  unitsTotal: number;
  unitsSold: number;
  unitsWaiting: number;
  capitalDeployed: number;
  atRisk: number;
  realisedProfit: number;
  unrealisedProfit: number;
  netProfit: number;
  /** Total profit over capital deployed, for the filtered set. */
  roi: number;
  /** Realised profit over the capital staked on units that actually sold. */
  realisedRoi: number;
  avgDaysToSell: number | null;
  best: Position | null;
  worst: Position | null;
};

/**
 * Totals for whatever is currently on screen.
 *
 * Deliberately recomputed from the filtered rows rather than scaled from the
 * all-time totals: the point of filtering is to ask "what did THESE make",
 * and a summary that didn't move with the filter would be worse than none.
 */
export function earningsSummary(positions: Position[]): EarningsSummary {
  const capitalDeployed = positions.reduce((s, p) => s + p.capitalDeployed, 0);
  const realisedProfit = positions.reduce((s, p) => s + p.realisedProfit, 0);
  const unrealisedProfit = positions.reduce((s, p) => s + p.unrealisedProfit, 0);
  const unitsSold = positions.reduce((s, p) => s + p.unitsSold, 0);

  // Weighted by units, not a mean of means: ten units at 30 days and one at
  // 300 is not "165 days".
  const soldWithTiming = positions.filter((p) => p.avgDaysToSell !== null && p.unitsSold > 0);
  const soldUnitsWithTiming = soldWithTiming.reduce((s, p) => s + p.unitsSold, 0);
  const avgDaysToSell = soldUnitsWithTiming
    ? round2(
        soldWithTiming.reduce((s, p) => s + (p.avgDaysToSell as number) * p.unitsSold, 0) /
          soldUnitsWithTiming
      )
    : null;

  // Capital behind sold units only, so realised ROI isn't diluted by money
  // still waiting.
  const soldCapital = positions.reduce(
    (s, p) => s + (p.unitsTotal > 0 ? (p.capitalDeployed / p.unitsTotal) * p.unitsSold : 0),
    0
  );

  const byProfit = [...positions].sort(
    (a, b) => b.realisedProfit + b.unrealisedProfit - (a.realisedProfit + a.unrealisedProfit)
  );

  return {
    productCount: positions.length,
    unitsTotal: positions.reduce((s, p) => s + p.unitsTotal, 0),
    unitsSold,
    unitsWaiting: positions.reduce((s, p) => s + p.unitsWaiting, 0),
    capitalDeployed: round2(capitalDeployed),
    atRisk: round2(positions.reduce((s, p) => s + p.atRisk, 0)),
    realisedProfit: round2(realisedProfit),
    unrealisedProfit: round2(unrealisedProfit),
    netProfit: round2(realisedProfit + unrealisedProfit),
    roi: capitalDeployed > 0 ? round2(((realisedProfit + unrealisedProfit) / capitalDeployed) * 100) : 0,
    realisedRoi: soldCapital > 0 ? round2((realisedProfit / soldCapital) * 100) : 0,
    avgDaysToSell,
    best: byProfit[0] ?? null,
    worst: byProfit.length > 1 ? byProfit[byProfit.length - 1] : null,
  };
}

/** How many positions fall in each band — for counts on the filter chips. */
export function bandCounts(positions: Position[]): Record<RoiBand, number> {
  const counts: Record<RoiBand, number> = {
    all: positions.length,
    high: 0,
    mid: 0,
    low: 0,
    negative: 0,
  };
  for (const p of positions) counts[roiBandOf(p.roi)] += 1;
  return counts;
}
