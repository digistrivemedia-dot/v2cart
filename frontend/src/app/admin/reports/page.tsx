"use client";

import { useState } from "react";
import { HiCash, HiChartBar } from "react-icons/hi";
import { SettlementQueue } from "@/components/admin/SettlementQueue";
import { RoleGuard } from "@/components/RoleGuard";
import { useTransactionsSummary } from "@/hooks/admin";

const TYPE_LABEL: Record<string, string> = {
  vendor_earning: "Vendor Earnings",
  vendor_reversal: "Vendor Reversals",
  platform_profit: "Platform Profit",
  platform_reversal: "Platform Reversals",
};

function ReportsContent() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { totals, breakdown, isLoading } = useTransactionsSummary(from || undefined, to || undefined);

  const cards = [
    { label: "Vendor Payouts", value: totals.vendorPayouts, icon: HiCash, color: "bg-blue-500" },
    { label: "Platform Profit", value: totals.platformProfit, icon: HiChartBar, color: "bg-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-600 mt-1">Platform-wide financial summary</p>
      </div>

      {/* Phase 21 — money the platform is holding because a customer can still
          return the goods. Above the ledger totals on purpose: these are
          amounts that have NOT hit the figures below yet. */}
      <SettlementQueue />

      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        {(from || to) && (
          <button
            onClick={() => { setFrom(""); setTo(""); }}
            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            Clear
          </button>
        )}
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
              <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">
                {isLoading ? "—" : `₹${card.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Breakdown by Transaction Type</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {breakdown.map((row) => (
            <div key={row._id} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4">
              <div>
                <span className="text-slate-700">{TYPE_LABEL[row._id] || row._id}</span>
                <span className="text-slate-400 text-xs ml-2">({row.count} transactions)</span>
              </div>
              <span className={`font-semibold whitespace-nowrap ${row.total < 0 ? "text-red-600" : "text-slate-900"}`}>
                {row.total < 0 ? "-" : ""}₹{Math.abs(row.total).toLocaleString("en-IN")}
              </span>
            </div>
          ))}
          {breakdown.length === 0 && !isLoading && (
            <p className="px-6 py-8 text-center text-slate-500">No transactions in this range.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <RoleGuard allow={["admin"]} redirectTo="/admin">
      <ReportsContent />
    </RoleGuard>
  );
}
