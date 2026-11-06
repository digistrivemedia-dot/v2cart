"use client";

/**
 * The vendor's money — Phase 23.
 *
 * Vendors had no payout screen because they had no payout rail: their
 * `vendor_earning` rows were reporting-only, and every vendor was paid by
 * manual bank transfer with nothing recording what had been settled.
 *
 * Uses the wallet endpoints for withdrawals. No top-up — a vendor has nothing
 * to deploy capital into. Every rupee a vendor holds is sale proceeds, so one
 * balance is the honest presentation.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { HiCurrencyRupee, HiClock } from "react-icons/hi";
import { FiArrowUpCircle, FiAlertCircle, FiInfo, FiTruck } from "react-icons/fi";
import { RoleGuard } from "@/components/RoleGuard";
import { useWallet, useWithdrawals, useWithdrawMutation } from "@/hooks/wallet";
import { useVendorStats } from "@/hooks/vendor";

const rupees = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  processing: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

function PayoutsContent() {
  const { wallet, isLoading, refetch } = useWallet();
  const { withdrawals, minWithdrawal, refetch: refetchWithdrawals } = useWithdrawals();
  const withdraw = useWithdrawMutation();
  const { stats } = useVendorStats();

  const [amount, setAmount] = useState("");

  const available = wallet?.withdrawable ?? 0;
  const pending = wallet?.pendingWithdrawal ?? 0;
  const min = minWithdrawal ?? 100;

  const submit = async () => {
    const value = Number(amount);
    if (!value || Number.isNaN(value) || value <= 0) {
      toast.error("Enter an amount to withdraw");
      return;
    }
    if (value < min) {
      toast.error(`The minimum withdrawal is ${rupees(min)}`);
      return;
    }
    if (value > available) {
      toast.error(`You can withdraw up to ${rupees(available)} right now`);
      return;
    }

    try {
      const result = await withdraw.withdrawAsync(value);
      toast.success(result.message);
      setAmount("");
      refetch();
      refetchWithdrawals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the withdrawal");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Payouts</h1>
        <p className="mt-1 text-slate-600">
          Money from your sold units, and withdrawals to your bank account
        </p>
      </div>

      {/* ── balances ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500">
              <HiCurrencyRupee className="h-5 w-5 text-white" />
            </div>
            <p className="text-sm text-slate-600">Available to withdraw</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {isLoading ? "—" : rupees(available)}
          </p>
        </div>

        {/* Phase 21's hold, said in the vendor's words: sold but not yet
            theirs, because the customer can still send it back. */}
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500">
              <HiClock className="h-5 w-5 text-white" />
            </div>
            <p className="text-sm text-sky-900">In return period</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-sky-900">
            {rupees(stats?.pendingIncome ?? 0)}
          </p>
          <p className="mt-1 text-xs text-sky-800">
            {(stats?.pendingUnits ?? 0) > 0
              ? `${stats?.pendingUnits} unit(s) sold — released once the customer's return window closes`
              : "Nothing waiting"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-400">
              <FiArrowUpCircle className="h-5 w-5 text-white" />
            </div>
            <p className="text-sm text-slate-600">On its way to your bank</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{rupees(pending)}</p>
        </div>
      </div>

      {/* Orders nobody has marked delivered never start their return clock, so
          their money never releases. The vendor cannot fix it, but knowing is
          the difference between chasing it and wondering. */}
      {(stats?.awaitingDelivery ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <FiTruck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <span className="font-semibold">
              {stats?.awaitingDelivery} sold unit(s) are not marked delivered yet.
            </span>{" "}
            The return window starts at delivery, so their money has not begun
            counting down. Ask support to confirm delivery if these have arrived.
          </p>
        </div>
      )}

      {/* ── withdraw ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Withdraw</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Paid to the bank account or UPI id on your vendor profile.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
            <input
              type="number"
              min={min}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(min)}
              className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={() => setAmount(String(available))}
            disabled={available < min}
            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            All of it
          </button>
          <button
            onClick={submit}
            disabled={withdraw.isPending || available < min}
            className="cursor-pointer rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {withdraw.isPending ? "Starting…" : "Withdraw"}
          </button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
          <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Minimum {rupees(min)}. Add your bank details on your{" "}
            <Link href="/profile" className="text-blue-600 underline">
              profile
            </Link>{" "}
            first, or the withdrawal will be refused.
          </span>
        </p>
      </div>

      {/* ── history ── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Withdrawal history</h2>
        </div>

        {withdrawals.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No withdrawals yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2 font-medium">Requested</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">To</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-5 font-medium">Settled</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w: any) => (
                  <tr key={w._id} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 text-slate-600">{fmtDate(w.createdAt)}</td>
                    <td className="py-2.5 pr-4 font-semibold tabular-nums text-slate-900">
                      {rupees(w.amount)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {w.destination?.upiId
                        || (w.destination?.accountLast4 ? `•••• ${w.destination.accountLast4}` : "—")}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[w.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {w.status}
                      </span>
                      {w.failureReason && (
                        <span className="mt-1 flex items-start gap-1 text-xs text-red-600">
                          <FiAlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                          {w.failureReason}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 text-slate-600">{fmtDate(w.settledAt)}</td>
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

export default function VendorPayoutsPage() {
  return (
    <RoleGuard allow={["vendor"]} redirectTo="/">
      <PayoutsContent />
    </RoleGuard>
  );
}
