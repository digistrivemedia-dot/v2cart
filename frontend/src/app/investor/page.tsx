"use client";

import Link from "next/link";
import { HiCash, HiCurrencyRupee, HiClock, HiCheckCircle, HiTrendingUp } from "react-icons/hi";
import { useInvestments, useInvestorEarnings, useInvestableProducts } from "@/hooks/investment";
import { useWallet } from "@/hooks/wallet";
import { PortfolioLiquidity } from "@/components/investor/PortfolioLiquidity";

export default function InvestorDashboard() {
  const { investments, isLoading: investmentsLoading } = useInvestments();
  const { totals, isLoading: earningsLoading } = useInvestorEarnings();
  // Reuses the investable-products query (already cached by the browse page)
  // purely for its sell-speed analytics.
  const { products: investableProducts } = useInvestableProducts();
  const { wallet } = useWallet();

  const unmatchedCount = investments.filter((inv: any) => inv.status === "unmatched").length;
  const matchedCount = investments.filter((inv: any) => inv.status === "matched").length;
  const isLoading = investmentsLoading || earningsLoading;

  const cards = [
    { label: "Total Invested", value: `₹${totals.totalInvested.toLocaleString("en-IN")}`, icon: HiCash, color: "bg-emerald-500" },
    { label: "Total Returned", value: `₹${totals.totalPaidOut.toLocaleString("en-IN")}`, icon: HiCurrencyRupee, color: "bg-blue-500" },
    { label: "Awaiting Sale", value: unmatchedCount, icon: HiClock, color: "bg-amber-500" },
    { label: "Matched to Sale", value: matchedCount, icon: HiCheckCircle, color: "bg-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Investor Dashboard</h1>
          <p className="text-slate-600 mt-1">Track your investments and returns</p>
        </div>
        <Link
          href="/investor/products"
          className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
        >
          <HiTrendingUp className="w-5 h-5" /> Browse Products
        </Link>
      </div>

      {/* The wallet, first: every investment is funded from it, so a zero
          balance is the one thing that blocks everything else. */}
      <Link
        href="/investor/wallet"
        className="block rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 transition-colors hover:bg-emerald-50"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-600">
              <HiCash className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Wallet</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                ₹{wallet.withdrawable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-slate-500">Capital to invest</p>
              <p className="font-semibold tabular-nums text-slate-900">
                ₹{wallet.capital.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Earnings</p>
              <p className="font-semibold tabular-nums text-emerald-700">
                ₹{wallet.earnings.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white">
              {wallet.capital > 0 ? "Manage" : "Add money"}
            </span>
          </div>
        </div>

        {wallet.capital <= 0 && (
          <p className="mt-3 text-sm text-emerald-800">
            Add money to your wallet to start funding units — investments are paid for from here,
            not by card.
          </p>
        )}
      </Link>

      <div className="grid md:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-slate-600 text-sm">{card.label}</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {isLoading ? "—" : card.value}
              </p>
            </div>
          );
        })}
      </div>

      {!isLoading && (
        <PortfolioLiquidity
          investments={investments}
          investableProducts={investableProducts}
        />
      )}

      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
        <p className="text-slate-600 text-sm">
          Investing funds one physical unit of a product's stock. When that unit sells to a customer, you get your fixed payout back.
          If your unit hasn't sold yet, it stays "Awaiting Sale" — no risk of losing your place in line.{" "}
          <Link href="/investor/investments" className="text-emerald-600 hover:underline">View your investments</Link>
        </p>
      </div>
    </div>
  );
}
