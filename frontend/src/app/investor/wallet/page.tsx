"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HiCash, HiTrendingUp, HiClock } from "react-icons/hi";
import {
  FiPlus,
  FiArrowUpRight,
  FiArrowDownLeft,
  FiInfo,
  FiRefreshCw,
  FiPackage,
  FiArrowUpCircle,
  FiCheckCircle,
  FiAlertCircle,
  FiLoader,
} from "react-icons/fi";
import {
  useWallet,
  useWalletStatement,
  useWalletSummary,
  useTopupMutation,
  useWithdrawals,
  useWithdrawMutation,
  type WalletRow,
  type Withdrawal,
} from "@/hooks/wallet";

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Amounts worth offering as one tap, rather than making them type. */
const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

/**
 * How each movement reads to the investor.
 *
 * The ledger's `type` is written for auditing; these are written for a human
 * looking at their own money. Keyed off every type the backend can write, so
 * a new one shows up as itself rather than as a blank row.
 */
const ROW_LABEL: Record<WalletRow["type"], string> = {
  topup: "Money added",
  investment: "Invested",
  principal_returned: "Capital returned",
  profit: "Profit earned",
  refund: "Price-drop refund",
  withdrawal_hold: "Withdrawal requested",
  withdrawal_paid: "Withdrawal paid",
  withdrawal_released: "Withdrawal cancelled",
  profit_reversal: "Profit reversed (order cancelled)",
  principal_reversal: "Capital redeployed (order cancelled)",
  opening_balance: "Earned before wallet launch",
  adjustment: "Adjustment",
};

/**
 * One line of the "where it came from / where it went" breakdown.
 *
 * Zero lines are hidden by the caller rather than rendered as ₹0.00 — a list
 * of zeroes buries the two numbers that matter.
 */
function SourceLine({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone: "in" | "out";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <p
        className={`flex-shrink-0 font-semibold tabular-nums ${
          tone === "in" ? "text-emerald-700" : "text-slate-700"
        }`}
      >
        {tone === "in" ? "+" : "−"}
        {rupees(value)}
      </p>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof HiCash;
  tone: "emerald" | "blue" | "slate";
}) {
  const palette = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    slate: "bg-slate-500",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="mb-1 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${palette}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <p className="text-sm text-slate-600">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{rupees(value)}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function StatementRow({ row }: { row: WalletRow }) {
  const credit = row.amount > 0;

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3 sm:px-6">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
              credit ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {credit ? (
              <FiArrowDownLeft className="h-3.5 w-3.5" />
            ) : (
              <FiArrowUpRight className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">
              {/* A hold row is "requested" only until the payout settles —
                  otherwise a completed withdrawal reads as still pending. */}
              {row.type === "withdrawal_hold" && row.withdrawal?.status === "paid"
                ? "Withdrawn to your bank"
                : row.type === "withdrawal_hold" && row.withdrawal?.status === "failed"
                  ? "Withdrawal failed — money returned"
                  : (ROW_LABEL[row.type] ?? row.type)}
            </p>
            {/* Product and unit count, because "invested ₹150" on its own
                doesn't say what was funded. */}
            <p className="truncate text-xs text-slate-500">
              {row.product?.name ? (
                <>
                  {row.product.name}
                  {row.quantity ? ` × ${row.quantity} unit${row.quantity === 1 ? "" : "s"}` : ""}
                </>
              ) : row.withdrawal?.utr ? (
                `UTR ${row.withdrawal.utr}`
              ) : (
                row.note ?? "—"
              )}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            row.bucket === "earnings"
              ? "bg-blue-100 text-blue-800"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {row.bucket === "earnings" ? "Earnings" : "Capital"}
        </span>
      </td>
      <td
        className={`px-4 py-3 text-right font-semibold tabular-nums ${
          credit ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {credit ? "+" : "−"}
        {rupees(Math.abs(row.amount))}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
        {rupees(row.balanceAfter)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-500 sm:px-6">
        {new Date(row.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
    </tr>
  );
}

/** One past withdrawal: amount, where it went, and what happened to it. */
function WithdrawalRow({ row }: { row: Withdrawal }) {
  const tone = {
    paid: { icon: FiCheckCircle, cls: "text-emerald-600", label: "Paid" },
    processing: { icon: FiLoader, cls: "text-amber-600", label: "On its way" },
    failed: { icon: FiAlertCircle, cls: "text-red-600", label: "Failed — money returned" },
  }[row.status];
  const Icon = tone.icon;

  const destination =
    row.destination?.type === "vpa"
      ? row.destination.upiId
      : row.destination?.accountLast4
        ? `A/C ••••${row.destination.accountLast4}`
        : null;

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <Icon className={`h-4 w-4 flex-shrink-0 ${tone.cls}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          {rupees(row.amount)}
          <span className={`ml-2 text-xs font-normal ${tone.cls}`}>{tone.label}</span>
        </p>
        <p className="truncate text-xs text-slate-500">
          {new Date(row.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {destination && <> · {destination}</>}
          {row.mode && <> · {row.mode}</>}
          {/* The UTR is what a bank asks for when tracing a transfer. */}
          {row.utr && <> · UTR {row.utr}</>}
        </p>
        {row.failureReason && (
          <p className="mt-0.5 text-xs text-red-600">{row.failureReason}</p>
        )}
      </div>
      {/* Which buckets funded it, since earnings is drawn first. */}
      <p className="flex-shrink-0 text-xs text-slate-400">
        {row.fromEarnings > 0 && <>earnings {rupees(row.fromEarnings)}</>}
        {row.fromEarnings > 0 && row.fromCapital > 0 && " · "}
        {row.fromCapital > 0 && <>capital {rupees(row.fromCapital)}</>}
      </p>
    </div>
  );
}

export default function InvestorWalletPage() {
  const params = useSearchParams();
  const { wallet, isLoading } = useWallet();
  const [bucket, setBucket] = useState<"all" | "capital" | "earnings">("all");
  const { rows, isLoading: rowsLoading } = useWalletStatement(
    bucket === "all" ? undefined : bucket
  );
  const { topup, isPending } = useTopupMutation();
  const { summary, byProduct } = useWalletSummary();
  const { withdrawals, minWithdrawal } = useWithdrawals();
  const { withdraw, isPending: isWithdrawing } = useWithdrawMutation();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const withdrawParsed = Number(withdrawAmount);
  const withdrawValid =
    !Number.isNaN(withdrawParsed) &&
    withdrawParsed >= minWithdrawal &&
    withdrawParsed <= wallet.withdrawable;

  const [amount, setAmount] = useState("");

  // The invest cart links here with the exact shortfall prefilled, so someone
  // sent over to top up doesn't have to work out how much they were short.
  const prefill = params.get("add");
  useEffect(() => {
    if (prefill && !Number.isNaN(Number(prefill))) setAmount(String(Math.ceil(Number(prefill))));
  }, [prefill]);

  const parsed = Number(amount);
  const amountValid = !Number.isNaN(parsed) && parsed >= 1;

  const deployed = useMemo(
    () =>
      rows
        .filter((r) => r.type === "investment")
        .reduce((sum, r) => sum + Math.abs(r.amount), 0),
    [rows]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Wallet</h1>
        <p className="mt-1 text-slate-600">
          Add money, fund investments, and withdraw your returns — all from here
        </p>
      </div>

      {/* The two buckets, explained rather than just labelled: the split is
          the whole point and is not self-evident from a number. */}
      <div className="grid gap-6 md:grid-cols-3">
        <BalanceCard
          label="Capital"
          value={isLoading ? 0 : wallet.capital}
          hint="Available to invest. Top-ups, returned principal and refunds land here."
          icon={HiCash}
          tone="emerald"
        />
        <BalanceCard
          label="Earnings"
          value={isLoading ? 0 : wallet.earnings}
          hint="Pure profit from units that have sold. Nothing else is counted here."
          icon={HiTrendingUp}
          tone="blue"
        />
        <BalanceCard
          label="Withdrawable"
          value={isLoading ? 0 : wallet.withdrawable}
          hint={
            wallet.pendingWithdrawal > 0
              ? `${rupees(wallet.pendingWithdrawal)} is being paid out`
              : "Capital + earnings, yours to take out"
          }
          icon={HiClock}
          tone="slate"
        />
      </div>

      {/* ── Add money ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Add money</h2>
        <p className="mb-4 text-sm text-slate-500">
          Goes into Capital, ready to fund units. Paid by card or UPI through Razorpay.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => setAmount(String(quick))}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                amount === String(quick)
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              ₹{quick.toLocaleString("en-IN")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              ₹
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="Enter an amount"
              aria-label="Amount to add"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-8 pr-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => topup(parsed)}
            disabled={!amountValid || isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiPlus className="h-4 w-4" />
            {isPending ? "Adding…" : amountValid ? `Add ${rupees(parsed)}` : "Add money"}
          </button>
        </div>

        {amount && !amountValid && (
          <p className="mt-2 text-sm text-red-600">The minimum top-up is ₹1.</p>
        )}
      </div>

      {/* ── Where the money came from and went ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-lg font-semibold text-slate-900">Money in</h2>
          <p className="mb-2 text-sm text-slate-500">Everything that has ever credited your wallet</p>

          <div className="divide-y divide-slate-100">
            {summary.inflow.topups > 0 && (
              <SourceLine
                label="Money you added"
                hint={`${summary.counts.topups} top-up${summary.counts.topups === 1 ? "" : "s"}`}
                value={summary.inflow.topups}
                tone="in"
              />
            )}
            {summary.inflow.profit > 0 && (
              <SourceLine
                label="Profit from sales"
                hint={`${summary.counts.salesSettled} unit${summary.counts.salesSettled === 1 ? "" : "s"} sold`}
                value={summary.inflow.profit}
                tone="in"
              />
            )}
            {summary.inflow.principalReturned > 0 && (
              <SourceLine
                label="Capital returned"
                hint="Principal back from units that sold"
                value={summary.inflow.principalReturned}
                tone="in"
              />
            )}
            {summary.inflow.refunds > 0 && (
              <SourceLine
                label="Price-drop refunds"
                hint={`${summary.counts.refunds} refund${summary.counts.refunds === 1 ? "" : "s"} — the vendor lowered the price after you funded`}
                value={summary.inflow.refunds}
                tone="in"
              />
            )}
            {summary.inflow.openingBalance > 0 && (
              <SourceLine
                label="Earned before wallet launch"
                hint="Profit on units that sold before the wallet existed"
                value={summary.inflow.openingBalance}
                tone="in"
              />
            )}
            {summary.totalIn === 0 && (
              <p className="py-4 text-sm text-slate-500">
                Nothing yet — add money above to get started.
              </p>
            )}
          </div>

          {summary.totalIn > 0 && (
            <div className="mt-2 flex items-center justify-between border-t-2 border-slate-200 pt-3">
              <p className="font-semibold text-slate-900">Total in</p>
              <p className="font-bold tabular-nums text-emerald-700">+{rupees(summary.totalIn)}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-lg font-semibold text-slate-900">Money out</h2>
          <p className="mb-2 text-sm text-slate-500">Everything that has left your wallet</p>

          <div className="divide-y divide-slate-100">
            {summary.outflow.invested > 0 && (
              <SourceLine
                label="Invested in units"
                hint={`${summary.counts.unitsFunded} unit${summary.counts.unitsFunded === 1 ? "" : "s"} across ${summary.counts.investments} order${summary.counts.investments === 1 ? "" : "s"}`}
                value={summary.outflow.invested}
                tone="out"
              />
            )}
            {summary.outflow.withdrawn > 0 && (
              <SourceLine
                label="Withdrawn to your bank"
                hint={`${summary.counts.withdrawals} withdrawal${summary.counts.withdrawals === 1 ? "" : "s"}, paid out`}
                value={summary.outflow.withdrawn}
                tone="out"
              />
            )}
            {summary.outflow.heldForWithdrawal > 0 && (
              <SourceLine
                label="On its way to your bank"
                hint={`${summary.counts.withdrawalsPending} payout${summary.counts.withdrawalsPending === 1 ? "" : "s"} in progress — returns automatically if it fails`}
                value={summary.outflow.heldForWithdrawal}
                tone="out"
              />
            )}
            {summary.outflow.profitReversed > 0 && (
              <SourceLine
                label="Profit reversed"
                hint="An order was cancelled, so its profit was clawed back"
                value={summary.outflow.profitReversed}
                tone="out"
              />
            )}
            {summary.outflow.principalRedeployed > 0 && (
              <SourceLine
                label="Capital redeployed"
                hint="A cancelled order re-pooled your unit, so its capital is deployed again"
                value={summary.outflow.principalRedeployed}
                tone="out"
              />
            )}
            {summary.totalOut === 0 && (
              <p className="py-4 text-sm text-slate-500">
                Nothing has left your wallet yet.
              </p>
            )}
          </div>

          {summary.totalOut > 0 && (
            <div className="mt-2 flex items-center justify-between border-t-2 border-slate-200 pt-3">
              <p className="font-semibold text-slate-900">Total out</p>
              <p className="font-bold tabular-nums text-slate-900">−{rupees(summary.totalOut)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Per product ── */}
      {byProduct.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FiPackage className="h-4 w-4 text-slate-400" />
              By product
            </h2>
            <p className="text-sm text-slate-500">
              What each product took from your wallet and gave back
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left font-semibold sm:px-6">Product</th>
                  <th className="px-4 py-3 text-right font-semibold">Units</th>
                  <th className="px-4 py-3 text-right font-semibold">Invested</th>
                  <th className="px-4 py-3 text-right font-semibold">Capital back</th>
                  <th className="px-4 py-3 text-right font-semibold">Refunded</th>
                  <th className="px-4 py-3 text-right font-semibold sm:px-6">Profit</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((row) => (
                  <tr
                    key={row.product}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 sm:px-6">
                      {row.name ?? "Unlisted product"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {row.unitsFunded || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {row.invested ? rupees(row.invested) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {row.principalReturned ? rupees(row.principalReturned) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.refunded ? (
                        <span className="inline-flex items-center gap-1 text-blue-700">
                          <FiRefreshCw className="h-3 w-3" />
                          {rupees(row.refunded)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums sm:px-6">
                      <span className={row.profit > 0 ? "text-emerald-700" : "text-slate-500"}>
                        {row.profit ? `+${rupees(row.profit)}` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Withdraw ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Withdraw</h2>
        <p className="mb-4 text-sm text-slate-500">
          Sent to your bank or UPI by RazorpayX. Earnings are used first, so your capital stays
          available to invest.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              ₹
            </span>
            <input
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder={`Minimum ₹${minWithdrawal}`}
              aria-label="Amount to withdraw"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-8 pr-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setWithdrawAmount(String(Math.floor(wallet.withdrawable)))}
            disabled={wallet.withdrawable < minWithdrawal}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            All ({rupees(wallet.withdrawable)})
          </button>
          <button
            type="button"
            onClick={() => withdraw(withdrawParsed)}
            disabled={!withdrawValid || isWithdrawing}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiArrowUpCircle className="h-4 w-4" />
            {isWithdrawing ? "Sending…" : "Withdraw"}
          </button>
        </div>

        {/* Say precisely why the button is disabled, rather than leaving it
            greyed out with no explanation. */}
        {withdrawAmount && !withdrawValid && (
          <p className="mt-2 text-sm text-red-600">
            {withdrawParsed < minWithdrawal
              ? `The minimum withdrawal is ₹${minWithdrawal}.`
              : `You can withdraw up to ${rupees(wallet.withdrawable)} right now.`}
          </p>
        )}

        {wallet.withdrawable < minWithdrawal && (
          <p className="mt-2 text-sm text-slate-500">
            You need at least {rupees(minWithdrawal)} withdrawable to make a withdrawal.
          </p>
        )}

        <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <FiInfo className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
          <p className="text-sm text-slate-600">
            Paid to the bank account or UPI id on your investor profile. UPI usually lands in
            seconds; a bank transfer can take a few minutes. The money leaves your balance straight
            away and comes back automatically if the transfer fails.
          </p>
        </div>

        {/* ── History ── */}
        {withdrawals.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Past withdrawals</h3>
            <div className="divide-y divide-slate-100">
              {withdrawals.map((row) => (
                <WithdrawalRow key={row._id} row={row} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Statement ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Statement</h2>
            <p className="text-sm text-slate-500">
              Every movement, newest first
              {deployed > 0 && <> · {rupees(deployed)} deployed into units so far</>}
            </p>
          </div>
          <div className="flex gap-2">
            {(["all", "capital", "earnings"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBucket(option)}
                aria-pressed={bucket === option}
                className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  bucket === option
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {rowsLoading ? (
          <div className="space-y-2 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-500">
              Nothing here yet — add money above to fund your first investment.
            </p>
            <Link
              href="/investor/products"
              className="mt-4 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Browse products to invest in
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left font-semibold sm:px-6">Movement</th>
                  <th className="px-4 py-3 text-left font-semibold">Bucket</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance after</th>
                  <th className="px-4 py-3 text-right font-semibold sm:px-6">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <StatementRow key={row._id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
