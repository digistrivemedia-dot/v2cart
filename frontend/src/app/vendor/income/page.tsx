"use client";

import { HiCurrencyRupee } from "react-icons/hi";
import { useVendorTransactions } from "@/hooks/vendor";

const TYPE_LABEL: Record<string, string> = {
  vendor_earning: "Earning",
  vendor_reversal: "Reversal (order cancelled)",
};

export default function VendorIncomePage() {
  const { transactions, isLoading } = useVendorTransactions();

  const total = transactions.reduce((sum: number, txn: any) => sum + txn.amount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Income</h1>
        <p className="text-slate-600 mt-1">Every payout and reversal, per product sold</p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <HiCurrencyRupee className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Total Income</h2>
        </div>
        <p className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">
          ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        {transactions.length === 0 ? (
          <div className="text-center px-4 py-16 sm:py-20">
            <HiCurrencyRupee className="w-20 h-20 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No income yet</h3>
            <p className="text-slate-600">Sales of your products will show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">Product</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">Type</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">Date</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-slate-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn: any) => (
                  <tr key={txn._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6 text-slate-900">{txn.product?.name || "—"}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${txn.type === "vendor_reversal" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                        {TYPE_LABEL[txn.type] || txn.type}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-sm">
                      {new Date(txn.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className={`py-4 px-6 text-right font-semibold ${txn.amount < 0 ? "text-red-600" : "text-slate-900"}`}>
                      {txn.amount < 0 ? "-" : ""}₹{Math.abs(txn.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
