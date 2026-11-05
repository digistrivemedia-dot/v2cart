"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HiCash, HiCurrencyRupee } from "react-icons/hi";
import { FiSearch, FiX, FiTrendingUp, FiTrendingDown, FiClock } from "react-icons/fi";
import { useInvestorEarnings, useInvestments, useInvestableProducts } from "@/hooks/investment";
import { buildPositions, formatDuration, type Position } from "@/lib/investor/portfolio";
import {
  deriveInvestorMetrics,
  MARGIN_TIER_META,
  MARGIN_TIER_ORDER,
} from "@/lib/investor/metrics";
import { MarginTierBadge } from "@/components/investor/InvestorCharts";
import { Pct } from "@/components/investor/Pct";
import {
  EMPTY_EARNINGS_FILTERS,
  ROI_BAND_OPTIONS,
  STATUS_OPTIONS,
  PERIOD_OPTIONS,
  SORT_OPTIONS,
  applyEarningsFilters,
  applyEarningsSort,
  earningsSummary,
  bandCounts,
  countActiveEarningsFilters,
  roiBandOf,
  formatRoi,
  type EarningsFilters,
} from "@/lib/investor/earnings";

const TYPE_LABEL: Record<string, string> = {
  investor_investment: "Capital Invested",
  investor_payout: "Payouts Received",
  investor_reversal: "Reversals (order cancelled)",
};

// Labelled from MARGIN_TIER_META, so this dropdown and the badge on a product
// card can never disagree about what a tier is called.
const TIER_OPTIONS: { value: EarningsFilters["tier"]; label: string }[] = [
  { value: "all", label: "Any margin band" },
  ...MARGIN_TIER_ORDER.map((value) => ({ value, label: MARGIN_TIER_META[value].label })),
];

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const rupees2 = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The band, as a ring around a navy pill.
 *
 * The pill was a light band-coloured fill with dark text, which gold can't sit
 * on legibly (gold on emerald-100 is ~4.2:1 and falls off from there). Navy
 * fill carries the gold at 8:1, and the band keeps its at-a-glance meaning
 * through the ring colour instead of the fill.
 */
const BAND_RING: Record<string, string> = {
  high: "ring-emerald-400",
  mid: "ring-blue-400",
  low: "ring-amber-400",
  negative: "ring-red-400",
};

/** A signed money figure, coloured by direction. */
function Delta({ value }: { value: number }) {
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-red-600" : "text-slate-500";
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {rupees2(Math.abs(value))}
    </span>
  );
}

function PositionRow({ position }: { position: Position }) {
  const band = roiBandOf(position.roi);
  const totalProfit = position.realisedProfit + position.unrealisedProfit;

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3 sm:px-6">
        <p className="font-medium text-slate-900">{position.productName}</p>
        <p className="text-xs text-slate-500">
          {position.unitsSold} sold · {position.unitsWaiting} waiting
        </p>
        {/* Under the name rather than in its own column — the table is already
            seven columns wide, and the tier belongs to the product. */}
        <span className="mt-1 inline-flex">
          <MarginTierBadge
            tier={position.marginTier ?? "low"}
            marginBands={position.marginBands}
            compact
          />
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {rupees(position.capitalDeployed)}
      </td>
      <td className="px-4 py-3 text-right">
        <Delta value={position.realisedProfit} />
      </td>
      <td className="px-4 py-3 text-right">
        <Delta value={position.unrealisedProfit} />
      </td>
      <td className="px-4 py-3 text-right">
        <Delta value={totalProfit} />
      </td>
      <td className="px-4 py-3 text-right">
        {/* Formatted through the same helper that bands it, so the figure
            and the band it was filed under can never disagree. */}
        <span
          title={`${band} return band`}
          className={`inline-flex rounded-full bg-brand-navy px-2.5 py-0.5 ring-2 ${BAND_RING[band]}`}
        >
          <Pct onDark className="text-xs">
            {formatRoi(position.roi)}
          </Pct>
        </span>
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">
        {position.avgDaysToSell === null ? "—" : formatDuration(position.avgDaysToSell)}
      </td>
    </tr>
  );
}

export default function InvestorEarningsPage() {
  const { totals, data, isLoading, maturingUnits } = useInvestorEarnings();
  // The same per-investment rows the portfolio page uses — the ledger totals
  // above can't be sliced by product or return, and this can.
  const { investments, isLoading: positionsLoading } = useInvestments();
  // Reuses the investable-products query (already cached by the browse page)
  // purely to read each product's margin band — the investment rows alone
  // carry no sales velocity, so the tier can't be derived from them.
  const { products: investableProducts } = useInvestableProducts();

  const [filters, setFilters] = useState<EarningsFilters>(EMPTY_EARNINGS_FILTERS);

  const positions = useMemo(() => {
    const byProduct = new Map(
      investableProducts.map((p) => [String(p._id), deriveInvestorMetrics(p)])
    );
    return buildPositions(investments).map((position) => {
      const metrics = byProduct.get(position.productId);
      return metrics
        ? { ...position, marginTier: metrics.marginTier, marginBands: metrics.marginBands }
        : position;
    });
  }, [investments, investableProducts]);
  const counts = useMemo(() => bandCounts(positions), [positions]);

  const rows = useMemo(
    () => applyEarningsSort(applyEarningsFilters(positions, filters), filters.sort),
    [positions, filters]
  );
  // Recomputed from the filtered rows, so the numbers answer "what did THESE
  // make" rather than restating the all-time totals.
  const summary = useMemo(() => earningsSummary(rows), [rows]);

  const activeCount = countActiveEarningsFilters(filters);
  const netReturn = totals.totalPaidOut - totals.totalInvested;

  const set = <K extends keyof EarningsFilters>(key: K, value: EarningsFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Earnings</h1>
        <p className="text-slate-600 mt-1">Your capital, payouts, and net return</p>
      </div>

      {/* All-time headline figures, straight from the ledger. Deliberately
          NOT affected by the filters below — these are the account totals. */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
              <HiCash className="w-5 h-5 text-white" />
            </div>
            <p className="text-slate-600 text-sm">Total Invested</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            ₹{totals.totalInvested.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <HiCurrencyRupee className="w-5 h-5 text-white" />
            </div>
            <p className="text-slate-600 text-sm">Total Returned</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            ₹{totals.totalPaidOut.toLocaleString("en-IN")}
          </p>
        </div>

        {/* Phase 21 — units that sold but whose customer can still return
            them. Deliberately NOT inside "Total Returned": nothing has been
            paid, and a return takes this straight back to zero. */}
        <div className="bg-white rounded-xl shadow-md border border-sky-200 p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-sky-500 rounded-lg flex items-center justify-center">
              <FiClock className="w-5 h-5 text-white" />
            </div>
            <p className="text-slate-600 text-sm">In return period</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            ₹{(totals.maturing ?? 0).toLocaleString("en-IN")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {maturingUnits.length > 0
              ? `${maturingUnits.length} sold unit${maturingUnits.length === 1 ? "" : "s"} `
                + `· ₹${(totals.maturingProfit ?? 0).toLocaleString("en-IN")} of it is profit`
              : "Nothing waiting on a return window"}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
          <p className="text-slate-600 text-sm mb-3">Net Return</p>
          <p
            className={`text-3xl font-bold mt-2 ${netReturn < 0 ? "text-red-600" : "text-slate-900"}`}
          >
            {netReturn < 0 ? "-" : ""}₹{Math.abs(netReturn).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* ── Analysis: the same money, sliced ── */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Earnings by product</h2>
            <p className="text-sm text-slate-500">
              Filter to compare which positions actually earned
            </p>
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_EARNINGS_FILTERS)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <FiX className="h-4 w-4" />
              Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          {/* Return band — the headline filter the rest hang off */}
          <div className="flex flex-wrap gap-2">
            {ROI_BAND_OPTIONS.map((option) => {
              const n = counts[option.value];
              const active = filters.band === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => set("band", option.value)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {option.label}
                  <span className={active ? "ml-1.5 text-emerald-100" : "ml-1.5 text-slate-400"}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.query}
                onChange={(e) => set("query", e.target.value)}
                placeholder="Search a product"
                aria-label="Search earnings by product"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={filters.status}
              onChange={(e) => set("status", e.target.value as EarningsFilters["status"])}
              aria-label="Filter by payout status"
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={filters.period}
              onChange={(e) => set("period", e.target.value as EarningsFilters["period"])}
              aria-label="Filter by period"
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Margin band — which of my positions are behind
                fast-selling stock, and which are behind the slow stuff.
                The windows are per product category, set by admin. */}
            <select
              value={filters.tier}
              onChange={(e) => set("tier", e.target.value as EarningsFilters["tier"])}
              aria-label="Filter by margin band"
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value as EarningsFilters["sort"])}
              aria-label="Sort earnings"
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom return range, for anything the bands don't cut finely enough */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Return between</span>
            <input
              value={filters.minRoi}
              onChange={(e) => set("minRoi", e.target.value)}
              inputMode="decimal"
              placeholder="min"
              aria-label="Minimum return percentage"
              className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-slate-400">%</span>
            <span className="text-slate-500">and</span>
            <input
              value={filters.maxRoi}
              onChange={(e) => set("maxRoi", e.target.value)}
              inputMode="decimal"
              placeholder="max"
              aria-label="Maximum return percentage"
              className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-slate-400">%</span>
          </div>
        </div>

        {/* Filtered subtotals */}
        <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Products", value: String(summary.productCount) },
            { label: "Capital in", value: rupees(summary.capitalDeployed) },
            { label: "Paid out", value: rupees(summary.realisedProfit), delta: summary.realisedProfit },
            { label: "Still to come", value: rupees(summary.unrealisedProfit), delta: summary.unrealisedProfit },
            { label: "Net profit", value: rupees(summary.netProfit), delta: summary.netProfit },
            {
              label: "Return",
              value: `${summary.roi >= 0 ? "+" : ""}${summary.roi.toFixed(1)}%`,
              delta: summary.roi,
              isPercent: true,
            },
          ].map((tile) => (
            <div key={tile.label} className="bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {tile.label}
              </p>
              <p
                className={`mt-0.5 font-bold tabular-nums ${
                  tile.isPercent
                    ? "text-brand-gold-text"
                    : tile.delta === undefined
                      ? "text-slate-900"
                      : tile.delta > 0
                        ? "text-emerald-700"
                        : tile.delta < 0
                          ? "text-red-600"
                          : "text-slate-900"
                }`}
              >
                {tile.value}
              </p>
            </div>
          ))}
        </div>

        {/* Best / worst, so the extremes don't have to be hunted for */}
        {summary.best && summary.worst && (
          <div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-2">
            <div className="flex items-center gap-2 bg-white px-6 py-3 text-sm">
              <FiTrendingUp className="h-4 w-4 flex-shrink-0 text-emerald-600" />
              <span className="text-slate-500">Best:</span>
              <span className="truncate font-medium text-slate-900">{summary.best.productName}</span>
              <Delta value={summary.best.realisedProfit + summary.best.unrealisedProfit} />
            </div>
            <div className="flex items-center gap-2 bg-white px-6 py-3 text-sm">
              <FiTrendingDown className="h-4 w-4 flex-shrink-0 text-red-500" />
              <span className="text-slate-500">Weakest:</span>
              <span className="truncate font-medium text-slate-900">{summary.worst.productName}</span>
              <Delta value={summary.worst.realisedProfit + summary.worst.unrealisedProfit} />
            </div>
          </div>
        )}

        {/* The rows */}
        {positionsLoading ? (
          <div className="space-y-2 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-500">
              {positions.length === 0
                ? "No investments yet — fund your first unit to see earnings here."
                : "No positions match these filters."}
            </p>
            {positions.length === 0 ? (
              <Link
                href="/investor/products"
                className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Browse products
              </Link>
            ) : (
              activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_EARNINGS_FILTERS)}
                  className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              )
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left font-semibold sm:px-6">Product</th>
                  <th className="px-4 py-3 text-right font-semibold">Capital</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid out</th>
                  <th className="px-4 py-3 text-right font-semibold">Still to come</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Return</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg sale time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((position) => (
                  <PositionRow key={position.productId} position={position} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger breakdown — unchanged, and still all-time */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Breakdown</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.transactions ?? []).map((row: any) => (
            <div key={row._id} className="flex items-center justify-between px-6 py-4">
              <span className="text-slate-700">{TYPE_LABEL[row._id] || row._id}</span>
              <span
                className={`font-semibold ${row.total < 0 ? "text-red-600" : "text-slate-900"}`}
              >
                {row.total < 0 ? "-" : ""}₹{Math.abs(row.total).toLocaleString("en-IN")}
              </span>
            </div>
          ))}
          {(!data?.transactions || data.transactions.length === 0) && (
            <p className="px-6 py-8 text-center text-slate-500">
              No activity yet — place your first investment to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
