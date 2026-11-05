"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiHelpCircle, FiXCircle } from "react-icons/fi";
import {
  deriveInvestorMetrics,
  formatWait,
  MARGIN_TIER_META,
  MARGIN_TIER_ORDER,
  DEFAULT_MARGIN_BANDS,
  type MarginTier,
  type MarginBands,
} from "@/lib/investor/metrics";
import { MarginTierBadge } from "./InvestorCharts";
import { Pct } from "./Pct";

/**
 * "Where is my capital sitting, and how fast is it coming back?"
 *
 * The dashboard's stat tiles already say how much is invested. What they can't
 * say is whether that money is parked behind fast-selling stock or stuck in
 * listings that haven't moved in months — which is the thing that should drive
 * how much more an investor puts in, and where.
 *
 * Waiting capital is bucketed by the margin band of the product backing it, shown
 * as a part-to-whole stacked bar (horizontal — the bucket names are long), then
 * broken out per product so concentration is visible.
 */

// Reserved status palette — each segment also carries an icon and a text label
// in the legend, so the state never depends on colour alone.
const TONE_COLOR: Record<string, string> = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#898781",
};

const TONE_ICON: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  good: FiCheckCircle,
  warning: FiClock,
  serious: FiAlertTriangle,
  critical: FiXCircle,
  neutral: FiHelpCircle,
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// A real ₹200 exposure rounding to "0%" beside its own rupee figure reads as a
// bug. Anything non-zero gets at least "<1%".
const percent = (pct: number) => (pct > 0 && pct < 1 ? "<1%" : `${pct.toFixed(0)}%`);

interface PortfolioLiquidityProps {
  /** From useInvestments() — the investor's own units. */
  investments: any[];
  /** From useInvestableProducts() — carries the sell-speed analytics. */
  investableProducts: any[];
}

export function PortfolioLiquidity({ investments, investableProducts }: PortfolioLiquidityProps) {
  const { rows, buckets, waitingTotal } = useMemo(() => {
    // Analytics only exist for products still open for investment. Anything an
    // investor holds that has since been delisted falls back to the lowest
    // band rather than being dropped — their money is still in it.
    const metricsById = new Map(
      investableProducts.map((p: any) => [String(p._id), deriveInvestorMetrics(p)])
    );

    const byProduct = new Map<
      string,
      {
        name: string;
        productId: string;
        waitingCapital: number;
        waitingUnits: number;
        soldUnits: number;
        marginTier: MarginTier;
        marginBands: MarginBands;
        estDaysToSale: number | null;
        queueAhead: number | null;
        stillListed: boolean;
      }
    >();

    for (const inv of investments) {
      const product = inv.product;
      const productId = String(typeof product === "object" ? product?._id : product);
      if (!productId || productId === "undefined") continue;

      const metrics = metricsById.get(productId);
      if (!byProduct.has(productId)) {
        byProduct.set(productId, {
          productId,
          name: (typeof product === "object" ? product?.name : null) || "Unlisted product",
          waitingCapital: 0,
          waitingUnits: 0,
          soldUnits: 0,
          marginTier: metrics?.marginTier ?? "low",
          marginBands: metrics?.marginBands ?? DEFAULT_MARGIN_BANDS,
          estDaysToSale: metrics?.estDaysToSale ?? null,
          queueAhead: metrics?.queueAhead ?? null,
          stillListed: Boolean(metrics),
        });
      }

      const row = byProduct.get(productId)!;
      if (inv.status === "unmatched") {
        row.waitingCapital += inv.amountInvested ?? 0;
        row.waitingUnits += 1;
      } else {
        row.soldUnits += 1;
      }
    }

    const allRows = Array.from(byProduct.values()).sort(
      (a, b) => b.waitingCapital - a.waitingCapital
    );

    const totals: Record<string, number> = {};
    for (const row of allRows) {
      totals[row.marginTier] = (totals[row.marginTier] ?? 0) + row.waitingCapital;
    }

    const total = Object.values(totals).reduce((sum, n) => sum + n, 0);

    return {
      rows: allRows,
      buckets: MARGIN_TIER_ORDER.map((key) => ({
        key,
        amount: totals[key] ?? 0,
        pct: total > 0 ? ((totals[key] ?? 0) / total) * 100 : 0,
      })).filter((b) => b.amount > 0),
      waitingTotal: total,
    };
  }, [investments, investableProducts]);

  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Where your capital is sitting</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Waiting capital grouped by the margin band of the product behind it.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Awaiting sale</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{rupees(waitingTotal)}</p>
        </div>
      </div>

      {waitingTotal > 0 ? (
        <>
          {/* Part-to-whole: one stacked bar, 2px gaps between segments */}
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
            {buckets.map((bucket) => (
              <div
                key={bucket.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${bucket.pct}%`,
                  // One dominant holding can push the rest below a pixel;
                  // keep every real segment visible.
                  minWidth: 4,
                  background: TONE_COLOR[MARGIN_TIER_META[bucket.key].tone],
                }}
                title={`${MARGIN_TIER_META[bucket.key].label}: ${rupees(bucket.amount)}`}
              />
            ))}
          </div>

          {/* Legend — icon + label + value, so identity is never colour-only */}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {buckets.map((bucket) => {
              const meta = MARGIN_TIER_META[bucket.key];
              const color = TONE_COLOR[meta.tone];
              const Icon = TONE_ICON[meta.tone];
              return (
                <div key={bucket.key} className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-xs text-slate-600">{meta.label}</span>
                  <span className="text-xs font-semibold text-slate-900 tabular-nums">
                    {rupees(bucket.amount)}
                  </span>
                  <Pct className="text-xs font-normal">{percent(bucket.pct)}</Pct>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Everything you&apos;ve funded has sold — no capital is waiting right now.
        </p>
      )}

      {/* Per-product exposure, so concentration is obvious */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="pb-2 pr-4 font-semibold text-slate-600">Product</th>
              <th className="pb-2 pr-4 font-semibold text-slate-600">Waiting</th>
              <th className="pb-2 pr-4 font-semibold text-slate-600">Units</th>
              <th className="pb-2 pr-4 font-semibold text-slate-600">Est. wait</th>
              <th className="pb-2 font-semibold text-slate-600">Margin band</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-4 text-slate-900">
                  {row.name}
                  {!row.stillListed && (
                    <span className="ml-2 text-xs text-slate-400">no longer listed</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 font-semibold text-slate-900 tabular-nums">
                  {row.waitingCapital > 0 ? rupees(row.waitingCapital) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-slate-600 tabular-nums">
                  {row.waitingUnits} waiting
                  {row.soldUnits > 0 && (
                    <span className="text-slate-400"> · {row.soldUnits} sold</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-slate-600 tabular-nums">
                  {row.waitingUnits > 0 ? formatWait(row.estDaysToSale) : "—"}
                </td>
                <td className="py-2.5">
                  <MarginTierBadge
                    tier={row.marginTier}
                    marginBands={row.marginBands}
                    compact
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link
        href="/investor/products"
        className="inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
      >
        Find faster-moving listings →
      </Link>
    </div>
  );
}
