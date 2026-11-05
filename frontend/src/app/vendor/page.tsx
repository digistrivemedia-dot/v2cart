"use client";

import Link from "next/link";
import { HiShoppingBag, HiCheckCircle, HiClock, HiCurrencyRupee, HiPlus } from "react-icons/hi";
import { useVendorStats } from "@/hooks/vendor";

export default function VendorDashboard() {
  const { stats, isLoading } = useVendorStats();

  const cards = [
    { label: "Total Products", value: stats.productCount, icon: HiShoppingBag, color: "bg-blue-500" },
    { label: "Live Listings", value: stats.liveCount, icon: HiCheckCircle, color: "bg-green-500" },
    { label: "Pending Approval", value: stats.pendingApprovalCount, icon: HiClock, color: "bg-amber-500" },
    { label: "Units Sold", value: stats.unitsSold, icon: HiShoppingBag, color: "bg-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Vendor Dashboard</h1>
          <p className="text-slate-600 mt-1">Track your listings, sales, and income</p>
        </div>
        <Link
          href="/vendor/products/create"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium"
        >
          <HiPlus className="w-5 h-5" /> Add Product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
              <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-slate-600 text-sm">{card.label}</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                {isLoading ? "—" : card.value}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <HiCurrencyRupee className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Lifetime Income</h2>
        </div>
        <p className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">
          {isLoading ? "—" : `₹${stats.lifetimeIncome.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </p>
        <p className="text-slate-500 text-sm mt-2">
          Your cost price paid out for every unit sold, minus any cancelled orders.{" "}
          <Link href="/vendor/income" className="text-blue-600 hover:underline">View full breakdown</Link>
        </p>

        {/* Phase 21 — the gap between "sold" and "paid". Without this the
            vendor sees sales on their orders page and no matching income, with
            nothing on screen explaining why. */}
        {!isLoading && (stats.pendingIncome ?? 0) > 0 && (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-sky-900">
                Awaiting release
              </p>
              <p className="text-xl font-bold text-sky-900">
                ₹{(stats.pendingIncome ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <p className="mt-1 text-xs text-sky-800">
              {stats.pendingUnits} unit{stats.pendingUnits === 1 ? "" : "s"} sold but not yet
              paid out — customers can still return them. Money is released once each
              return window closes.
              {(stats.awaitingDelivery ?? 0) > 0 && (
                <>
                  {" "}
                  <strong>
                    {stats.awaitingDelivery} of those {stats.awaitingDelivery === 1 ? "is" : "are"} not
                    marked delivered yet
                  </strong>
                  , so the return clock has not started on {stats.awaitingDelivery === 1 ? "it" : "them"}.
                </>
              )}
              {stats.nextReleaseAt && (
                <>
                  {" "}Next release{" "}
                  {new Date(stats.nextReleaseAt).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                  .
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
