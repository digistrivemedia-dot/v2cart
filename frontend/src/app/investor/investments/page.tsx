"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HiClipboardList } from "react-icons/hi";
import { FiAlertTriangle, FiChevronDown, FiClock, FiSearch } from "react-icons/fi";
import { useInvestments } from "@/hooks/investment";
import { StatTile } from "@/components/investor/InvestorCharts";
import { Pct } from "@/components/investor/Pct";
import {
  buildPositions,
  portfolioTotals,
  formatDate,
  formatDuration,
  formatDaysLeft,
  returnDaysLeft,
  type Position,
} from "@/lib/investor/portfolio";

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const rupees2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SORTS = [
  { label: "Most recent", value: "recent" },
  { label: "Largest position", value: "capital" },
  { label: "Best return", value: "roi" },
  { label: "Longest held", value: "held" },
  { label: "Most units", value: "units" },
] as const;

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Awaiting sale", value: "waiting" },
  { label: "In return period", value: "maturing" },
  { label: "Sold", value: "sold" },
] as const;

function Money({ value, signed = false }: { value: number; signed?: boolean }) {
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-red-600" : "text-slate-900";
  return (
    <span className={`font-semibold tabular-nums ${signed ? tone : "text-slate-900"}`}>
      {signed && value > 0 ? "+" : ""}
      {rupees2(value)}
    </span>
  );
}

function PositionRow({ position }: { position: Position }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full cursor-pointer grid-cols-2 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 sm:px-6 lg:grid-cols-12"
      >
        <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-4">
          <FiChevronDown
            className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{position.productName}</p>
            <p className="text-xs text-slate-500">
              {position.unitsTotal} unit{position.unitsTotal === 1 ? "" : "s"}
              {position.unitsWaiting > 0 && ` · ${position.unitsWaiting} awaiting`}
              {position.unitsSold > 0 && ` · ${position.unitsSold} sold`}
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 lg:hidden">Invested</p>
          <p className="font-semibold tabular-nums text-slate-900">{rupees(position.capitalDeployed)}</p>
          <p className="text-xs text-slate-500">avg {rupees2(position.avgBuyPrice)}/unit</p>
        </div>

        <div className="lg:col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 lg:hidden">Realised</p>
          <Money value={position.realisedProfit} signed />
          {position.unrealisedProfit !== 0 && (
            <p className="text-xs text-slate-500 tabular-nums">
              {rupees2(position.unrealisedProfit)} pending
            </p>
          )}
        </div>

        <div className="lg:col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 lg:hidden">Return</p>
          <Pct className="block">
            {position.roi > 0 ? "+" : ""}
            {position.roi.toFixed(1)}%
          </Pct>
        </div>

        <div className="lg:col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 lg:hidden">Timing</p>
          <p className="text-sm tabular-nums text-slate-700">
            {position.avgDaysToSell !== null
              ? `sold in ${formatDuration(position.avgDaysToSell)}`
              : `held ${formatDuration(position.longestWaitDays)}`}
          </p>
          <p className="text-xs text-slate-500">since {formatDate(position.firstInvestedAt)}</p>
        </div>
      </button>

      {open && (
        <div className="bg-slate-50/70 px-4 pb-4 sm:px-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Invested on</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Pays out</th>
                  <th className="py-2 pr-4 font-medium">Profit</th>
                  <th className="py-2 pr-4 font-medium">Held</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {position.units.map((unit) => (
                  <tr key={unit.id} className="border-t border-slate-200/70">
                    <td className="py-2.5 pr-4 text-slate-700">{formatDate(unit.investedAt)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-900">
                      {rupees2(unit.amountInvested)}
                      {unit.refundedTotal > 0 && (
                        <span
                          className="ml-1.5 text-xs text-amber-700"
                          title="The product's price dropped after you funded this unit, so part of your capital was returned and the terms were rewritten."
                        >
                          {rupees2(unit.refundedTotal)} refunded
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-900">
                      {rupees2(unit.expectedPayout)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Money value={unit.profit} signed />
                      <Pct className="ml-1 text-xs">({unit.roi.toFixed(1)}%)</Pct>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-700">
                      {formatDuration(unit.heldDays)}
                      {unit.soldAt && (
                        <span className="block text-xs text-slate-500">
                          sold {formatDate(unit.soldAt)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {unit.status === "sold" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                          Sold{unit.orderStatus ? ` · ${unit.orderStatus}` : ""}
                        </span>
                      ) : unit.status === "maturing" ? (
                        /* Phase 21 — sold, but the customer can still send it
                           back, so this money is not the investor's yet. Said
                           plainly rather than shown as "Sold", which would
                           imply the payout had landed. */
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800"
                          title={
                            unit.maturesAt
                              ? `Sold. The customer has until ${formatDate(unit.maturesAt)} to return it — `
                                + `${rupees2(unit.pendingPayout)} is released to you after that.`
                              : "Sold. The return window starts once the order is delivered."
                          }
                        >
                          <FiClock className="h-3 w-3" />
                          In return period
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          Awaiting sale
                        </span>
                      )}
                      {unit.status === "maturing" && (
                        <span className="mt-1 block text-xs">
                          {/* The countdown, not just the date: "In return
                              period" on its own does not tell the investor
                              whether that means tomorrow or next week. */}
                          <span
                            className={
                              returnDaysLeft(unit.maturesAt) === 0
                                ? "font-medium text-emerald-700"
                                : "font-medium text-sky-700"
                            }
                          >
                            {formatDaysLeft(unit.maturesAt)}
                          </span>
                          {unit.maturesAt && (
                            <span className="text-slate-500">
                              {" · pays "}
                              {formatDate(unit.maturesAt)}
                            </span>
                          )}
                        </span>
                      )}
                      {unit.refundFailed && (
                        <span
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                          title="A refund was owed on this unit but the payment gateway call failed. The amount is still recorded as owed to you."
                        >
                          <FiAlertTriangle className="h-3 w-3" /> refund pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvestorInvestmentsPage() {
  const { investments, isLoading } = useInvestments();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]["value"]>("recent");

  const positions = useMemo(() => buildPositions(investments), [investments]);
  const totals = useMemo(() => portfolioTotals(positions), [positions]);

  // The nearest window to close, so the tile answers "how long" and not just
  // "how much". Units with no maturesAt are excluded rather than treated as
  // due: their order is not delivered, so their clock has not started.
  const soonestRelease = useMemo(() => {
    const dates = positions
      .flatMap((p) => p.units)
      .filter((u) => u.status === "maturing" && u.maturesAt)
      .map((u) => u.maturesAt as number);
    if (dates.length === 0) return "awaiting delivery";
    return `next ${formatDaysLeft(Math.min(...dates))}`;
  }, [positions]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    let rows = positions.filter((p) => {
      if (query && !p.productName.toLowerCase().includes(query)) return false;
      if (statusFilter === "waiting" && p.unitsWaiting === 0) return false;
      if (statusFilter === "maturing" && p.unitsMaturing === 0) return false;
      if (statusFilter === "sold" && p.unitsSold === 0) return false;
      return true;
    });

    rows = [...rows];
    switch (sortBy) {
      case "capital":
        return rows.sort((a, b) => b.capitalDeployed - a.capitalDeployed);
      case "roi":
        return rows.sort((a, b) => b.roi - a.roi);
      case "held":
        return rows.sort((a, b) => a.firstInvestedAt - b.firstInvestedAt);
      case "units":
        return rows.sort((a, b) => b.unitsTotal - a.unitsTotal);
      case "recent":
      default:
        return rows.sort((a, b) => b.lastInvestedAt - a.lastInvestedAt);
    }
  }, [positions, search, statusFilter, sortBy]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Portfolio</h1>
          <p className="mt-1 text-slate-600">Every unit you&apos;ve funded and what it has done</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white py-20 text-center shadow-sm">
          <HiClipboardList className="mx-auto mb-4 h-20 w-20 text-slate-300" />
          <h3 className="mb-2 text-xl font-semibold text-slate-900">No investments yet</h3>
          <p className="mb-5 text-slate-600">
            Fund your first unit and it will show up here with its full history.
          </p>
          <Link
            href="/investor/products"
            className="inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Portfolio</h1>
        <p className="mt-1 text-slate-600">
          Every unit you&apos;ve funded — what you put in, what came back, and how long it took.
        </p>
      </div>

      {/* Headline numbers. Realised and unrealised are deliberately separate:
          one is cash that moved, the other is a forecast. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <StatTile
          label="At risk"
          value={rupees(totals.atRisk)}
          sub={`${totals.unitsWaiting} awaiting, ${totals.unitsMaturing} in return period`}
          hint="Capital in units that haven't paid out yet. A unit inside its return window still counts: if the customer sends it back, it goes into the pool to be sold again."
        />
        {/* Phase 21 — sold but not yet payable. Its own tile rather than
            folded into Realised, because a return takes it back to zero. */}
        <StatTile
          label="In return period"
          value={rupees(totals.maturingValue)}
          sub={
            totals.unitsMaturing > 0
              ? `${totals.unitsMaturing} unit${totals.unitsMaturing === 1 ? "" : "s"} · ${soonestRelease}`
              : "Nothing waiting"
          }
          hint="These units have sold, but the customer can still return them. The money is released to you once each return window closes."
        />
        <StatTile
          label="Realised"
          value={`${totals.realisedProfit >= 0 ? "+" : ""}${rupees(totals.realisedProfit)}`}
          sub={`${totals.unitsSold} unit${totals.unitsSold === 1 ? "" : "s"} sold`}
          hint="Profit from units that have actually sold and paid out."
          emphasis
        />
        <StatTile
          label="Pending"
          value={rupees(totals.unrealisedProfit)}
          sub="If every unit sells"
          hint="Profit the unsold units are expected to make. Not earned yet."
        />
        <StatTile
          label="Realised return"
          value={totals.unitsSold > 0 ? `${totals.realisedRoi.toFixed(1)}%` : "—"}
          sub="On capital that sold"
          isPercent
        />
        <StatTile
          label="Avg time to sell"
          value={formatDuration(totals.avgDaysToSell)}
          sub={totals.unitsSold > 0 ? "Across sold units" : "Nothing sold yet"}
        />
        <StatTile
          label="Products"
          value={String(totals.productCount)}
          sub={`${totals.unitsTotal} unit${totals.unitsTotal === 1 ? "" : "s"} total`}
        />
      </div>

      {totals.refundedTotal > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{rupees2(totals.refundedTotal)}</strong> was returned to you after vendors lowered
          their prices. Those units were repriced to the new terms, so your return percentage is
          unchanged.
          {totals.refundFailedCount > 0 && (
            <>
              {" "}
              <strong>{totals.refundFailedCount}</strong>{" "}
              {totals.refundFailedCount === 1
                ? "refund failed to reach your payment method and is"
                : "refunds failed to reach your payment method and are"}{" "}
              still owed to you.
            </>
          )}
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your products"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-300 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as (typeof SORTS)[number]["value"])}
          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Positions */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-12 gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <div className="col-span-4">Product</div>
          <div className="col-span-2">Invested</div>
          <div className="col-span-2">Realised</div>
          <div className="col-span-2">Return</div>
          <div className="col-span-2">Timing</div>
        </div>

        {visible.length > 0 ? (
          visible.map((position) => <PositionRow key={position.productId} position={position} />)
        ) : (
          <p className="px-6 py-12 text-center text-slate-500">
            No positions match that filter.
          </p>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Tap any product to see its individual units, with the exact date each was funded and sold.
      </p>
    </div>
  );
}
