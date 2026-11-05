/**
 * Investor decision metrics.
 *
 * Two different questions, and an investor needs both:
 *
 *   • WHAT they earn — the margin band. How long the unit takes to sell decides
 *     the percentage: fast sale, small return; slow sale, big return. Set per
 *     product by admin at approval (Phase 20).
 *   • HOW LONG their capital is tied up — velocity and FIFO queue depth:
 *
 *       velocity      — units of this product actually selling per week
 *       queueAhead    — unmatched investments already in front of theirs
 *       estDaysToSale — (queueAhead + 1) / velocity, in days
 *       annualised    — the band % scaled by how fast it turns over
 *
 * Those two interact: a slower sale pays a higher percentage but takes longer
 * to pay it, so annualised return is the figure that actually ranks listings.
 *
 * Derived in one place because the product grid, the filters, and the sort
 * comparators must all agree on them.
 */

/**
 * The margin band a product sits in — distinct from its PRODUCT category
 * (Electronics, Fashion…), which is the taxonomy it's listed under.
 *
 * THE NAME TRACKS THE PERCENTAGE, NOT THE SPEED: `high` is the slowest band and
 * the best-paying one. This is the opposite of the Phase 16 `MarginTier` it
 * replaces, where `high` meant fastest.
 *
 * `stalled` and `untested` are gone. They existed only because the old rolling
 * velocity window could empty out; a band comes from the product's own rules
 * now, so every product has exactly one of these three.
 */
export type MarginTier = "low" | "medium" | "high";

/** One band: sells within `days` -> the investor earns `pct`. */
export type MarginBand = { days: number; pct: number };

/** A product's three bands, as the API sends them (already resolved). */
export type MarginBands = { low: MarginBand; medium: MarginBand; high: MarginBand };

/**
 * Only a fallback for a payload missing its bands — the API resolves and sends
 * each product's real set. Mirrors DEFAULT_MARGIN_BANDS in
 * backend/utils/marginBands.js (no module is shared across the two apps).
 */
export const DEFAULT_MARGIN_BANDS: MarginBands = {
  low: { days: 10, pct: 5 },
  medium: { days: 15, pct: 10 },
  high: { days: 90, pct: 15 },
};

/** Slowest last. Display order for every filter, bucket list and dropdown. */
export const MARGIN_TIER_ORDER: MarginTier[] = ["low", "medium", "high"];

export type InvestorMetrics = {
  raw: any;
  investorPrice: number;
  /** Payout under the product's CURRENT band. A forecast — see marginBands. */
  investorPayout: number;
  /**
   * Profit per unit as a % of capital in, under the current band. Varies by
   * product and by band again since Phase 20 — it was identical everywhere
   * while the investor took the whole platform margin.
   */
  roi: number;
  investedUnits: number;
  investableUnits: number;
  remainingUnits: number;
  /** 0–100, how much of this listing's investable stock is already funded. */
  fundingPct: number;
  /** Weekly sold-unit counts, oldest first — the sparkline series. */
  salesByWeek: number[];
  unitsSoldRecent: number;
  unitsSoldWindow: number;
  recentWeeks: number;
  salesWindowWeeks: number;
  /** Units sold per week, favouring recent weeks when there's recent activity. */
  velocityPerWeek: number;
  /** Unmatched investments ahead of a new one under FIFO. */
  queueAhead: number;
  /** Funded units of this product that have already sold. */
  unitsMatched: number;
  /** Observed average days from investment to sale. Null = nothing has sold. */
  avgDaysToMatch: number | null;
  /** Forward estimate for a NEW investment. Null when nothing is selling. */
  estDaysToSale: number | null;
  /** Simple (non-compounded) annualised return. Null when no estimate. */
  annualisedReturn: number | null;
  /**
   * Days for ONE unit of this product to sell at current velocity, ignoring
   * the investor queue. Feeds estDaysToSale only — it stopped deciding the
   * band in Phase 20, which the API now resolves from the product's own rules.
   */
  daysToSellOneUnit: number | null;
  /** This product's three bands, as set by admin (or the platform defaults). */
  marginBands: MarginBands;
  /** The band the product currently sits in. Resolved by the API. */
  marginTier: MarginTier;
  /** What each band would pay on this investor's capital. */
  payoutRange: { band: MarginTier; days: number; pct: number; payout: number }[];
  /**
   * Phase 21 — how long after the unit SELLS before the investor is paid. The
   * customer's return window, which is dead time on top of the wait to sell:
   * `estDaysToSale` says how long until a buyer, this says how long after that
   * until the money lands.
   */
  returnWindowDays: number;
  returnPolicy: "full" | "replacement_only" | "none";
  categorySlug: string;
  tags: string[];
  createdAt: number;
};

/**
 * `blurb` is the product-agnostic wording, for places that list bands across
 * many products at once (the filter sidebar) and so cannot quote one product's
 * day counts. Where a single product is in view use marginTierHint(), which
 * quotes that product's real numbers.
 *
 * The tones read as "more money, longer wait" rather than good-to-bad: a high
 * band is not a worse investment, it is a slower and better-paying one, and
 * colouring it as a warning would editorialise a choice that is the
 * investor's.
 */
export const MARGIN_TIER_META: Record<
  MarginTier,
  { label: string; blurb: string; tone: "good" | "warning" | "serious" | "critical" | "neutral" }
> = {
  low: { label: "Low margin", blurb: "Sells fastest, smallest return", tone: "neutral" },
  medium: { label: "Medium margin", blurb: "Mid-pace, mid return", tone: "good" },
  high: { label: "High margin", blurb: "Slowest to sell, biggest return", tone: "warning" },
};

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * The explanation under a band label, quoting that product's real numbers and
 * the percentage it pays. Generated rather than stored, because the days and
 * the percentages are set per product — a fixed "under 30 days" was a lie the
 * moment one product set its own windows.
 */
export function marginTierHint(
  tier: MarginTier,
  bands: MarginBands = DEFAULT_MARGIN_BANDS
): string {
  switch (tier) {
    case "low":
      return `Sells in ${plural(bands.low.days)} or less — earns ${bands.low.pct}%`;
    case "medium":
      return `Sells in ${bands.low.days}–${plural(bands.medium.days)} — earns ${bands.medium.pct}%`;
    case "high":
      return `Slower than ${plural(bands.medium.days)} — earns ${bands.high.pct}%`;
  }
}

/**
 * Which band a wait of `days` falls into. EXACT mirror of bandFor() in
 * backend/utils/marginBands.js — the server classifies for money, this
 * classifies for display, and the two must never disagree.
 *
 * Only used as a fallback: the API sends each product's resolved band, because
 * it is the side that can see admin's starting pick and the observed sell times.
 */
export function bandFor(days: number, bands: MarginBands): MarginTier {
  if (days <= bands.low.days) return "low";
  if (days <= bands.medium.days) return "medium";
  // `high.days` is the outer edge admin expects to type, not a cutoff — a unit
  // slower than it has nowhere higher to go.
  return "high";
}

function resolveBands(raw: { marginBands?: any }): MarginBands {
  const b = raw?.marginBands;
  const complete =
    b &&
    (["low", "medium", "high"] as const).every(
      (k) => b[k] && b[k].days != null && b[k].pct != null
    );
  if (!complete) return DEFAULT_MARGIN_BANDS;
  return {
    low: { days: Number(b.low.days), pct: Number(b.low.pct) },
    medium: { days: Number(b.medium.days), pct: Number(b.medium.pct) },
    high: { days: Number(b.high.days), pct: Number(b.high.pct) },
  };
}

export function deriveInvestorMetrics(p: any): InvestorMetrics {
  const investorPrice = p.investorPrice ?? 0;
  const investorPayout = p.investorPayout ?? 0;
  const investableUnits = p.investableUnits ?? p.stock ?? 0;
  const investedUnits = p.investedUnits ?? 0;

  const salesWindowWeeks = p.salesWindowWeeks ?? 12;
  const recentWeeks = p.recentWeeks ?? 4;
  const salesByWeek: number[] = Array.isArray(p.salesByWeek)
    ? p.salesByWeek
    : new Array(salesWindowWeeks).fill(0);
  const unitsSoldRecent = p.unitsSoldRecent ?? 0;
  const unitsSoldWindow = p.unitsSoldWindow ?? 0;

  // Prefer the recent window so a product that just started moving isn't
  // dragged down by 8 dead weeks; fall back to the full window when the recent
  // one is empty but there is older history to go on.
  const velocityPerWeek =
    unitsSoldRecent > 0
      ? unitsSoldRecent / recentWeeks
      : unitsSoldWindow > 0
        ? unitsSoldWindow / salesWindowWeeks
        : 0;

  const queueAhead = p.queueAhead ?? 0;
  const unitsMatched = p.unitsMatched ?? 0;
  const avgDaysToMatch = p.avgDaysToMatch ?? null;

  // A new unit is position queueAhead+1 in the FIFO queue, so it waits for that
  // many sales. No velocity means no honest estimate — null, not Infinity.
  const estDaysToSale =
    velocityPerWeek > 0
      ? Number((((queueAhead + 1) / velocityPerWeek) * 7).toFixed(1))
      : null;

  // Same velocity, no queue — how fast the PRODUCT moves rather than how long
  // this investor waits. Feeds estDaysToSale only; the band comes from the
  // product's own rules, which the API has already resolved.
  const daysToSellOneUnit =
    velocityPerWeek > 0 ? Number((7 / velocityPerWeek).toFixed(1)) : null;

  const marginBands = resolveBands(p);

  // Trust the API's resolved band — it is the only side that can see admin's
  // starting pick and the product's observed sell times. Fall back to
  // classifying the forward estimate, so a payload without one still renders.
  const marginTier: MarginTier =
    p.marginCategory && MARGIN_TIER_ORDER.includes(p.marginCategory)
      ? p.marginCategory
      : bandFor(daysToSellOneUnit ?? Infinity, marginBands);

  // What this investor earns in the product's current band. A forecast: the
  // figure they are actually paid depends on how long THEIR unit takes to
  // sell, which is why payoutRange exists alongside it.
  const roi = marginBands[marginTier].pct;

  const payoutRange =
    Array.isArray(p.payoutRange) && p.payoutRange.length === 3
      ? p.payoutRange
      : MARGIN_TIER_ORDER.map((band) => ({
          band,
          days: marginBands[band].days,
          pct: marginBands[band].pct,
          payout: Number((investorPrice * (1 + marginBands[band].pct / 100)).toFixed(2)),
        }));

  const annualisedReturn =
    estDaysToSale !== null && estDaysToSale > 0
      ? Number(((roi * 365) / estDaysToSale).toFixed(1))
      : null;

  return {
    raw: p,
    investorPrice,
    investorPayout,
    roi,
    investedUnits,
    investableUnits,
    remainingUnits: p.remainingInvestableUnits ?? 0,
    fundingPct: investableUnits > 0 ? (investedUnits / investableUnits) * 100 : 0,
    salesByWeek,
    unitsSoldRecent,
    unitsSoldWindow,
    recentWeeks,
    salesWindowWeeks,
    velocityPerWeek,
    queueAhead,
    unitsMatched,
    avgDaysToMatch,
    estDaysToSale,
    annualisedReturn,
    daysToSellOneUnit,
    marginBands,
    marginTier,
    payoutRange,
    // Resolved by the API (never null), so a product on the platform default
    // still reports its real window.
    returnWindowDays: Number(p.returnWindowDays ?? 0),
    returnPolicy: p.returnPolicy ?? "full",
    categorySlug: p.category?.slug || p.category?._id || p.category || "",
    tags: Array.isArray(p.tags) ? p.tags : [],
    createdAt: new Date(p.createdAt ?? 0).getTime(),
  };
}

/** "18 days" / "2.4 months" — days are unhelpful past a couple of months. */
export function formatWait(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "under a day";
  if (days < 60) return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
  return `${(days / 30.44).toFixed(1)} months`;
}
