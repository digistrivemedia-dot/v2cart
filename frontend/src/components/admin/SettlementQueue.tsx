"use client";

/**
 * Money held inside return windows — MARKETPLACE_CONVERSION_PLAN.md Phase 21.
 *
 * Answers the two questions admin has once settlement stops being instant:
 * what is waiting and when does it release, and — more importantly — what is
 * STUCK. An order nobody marks Delivered never starts its return clock, so its
 * vendor and investor are never paid. That is a silent failure, and this panel
 * is the only place it surfaces.
 */

import { toast } from "sonner";
import { FiClock, FiAlertTriangle, FiCheckCircle, FiTruck } from "react-icons/fi";
import Link from "next/link";
import {
  useSettlementQueue,
  useReleaseDuePayouts,
} from "@/hooks/admin/queries/useSettlementQueue";

const POLICY_LABEL: Record<string, string> = {
  full: "refundable",
  replacement_only: "replacement only",
  none: "no return",
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

export function SettlementQueue() {
  const { holding, dueNow, awaitingDeliveryMark, isLoading } = useSettlementQueue();
  const release = useReleaseDuePayouts();

  const onRelease = async () => {
    try {
      const result = await release.mutateAsync();
      toast.success(result.message);
      if (result.errors?.length) {
        toast.error(`${result.errors.length} line(s) could not be settled — check the logs`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to release payouts");
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Loading held payouts…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Stuck: shipped but never marked delivered ───────────────────── */}
      {awaitingDeliveryMark.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-amber-900">
                {awaitingDeliveryMark.length} shipped order
                {awaitingDeliveryMark.length === 1 ? "" : "s"} not marked delivered
              </h3>
              <p className="mt-1 text-xs text-amber-800">
                The return window starts at delivery, so vendors are not paid yet. Mark them Delivered once they
                have arrived — nothing releases until you do.
              </p>
              <ul className="mt-3 space-y-1.5">
                {awaitingDeliveryMark.map((o) => (
                  <li key={o.order} className="flex flex-wrap items-center gap-2 text-xs">
                    <FiTruck className="h-3.5 w-3.5 text-amber-700" />
                    <Link
                      href={`/admin/orders/${o.order}`}
                      className="font-medium text-amber-900 underline"
                    >
                      #{o.order.slice(-8)}
                    </Link>
                    <span className="text-amber-800">{o.customer ?? "—"}</span>
                    <span className="text-amber-700">
                      shipped {fmtDate(o.shippedAt)}
                      {o.daysSinceShipped != null && ` · ${o.daysSinceShipped}d ago`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Holding ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <FiClock className="h-4 w-4 text-sky-600" />
              In return period
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Sold units whose money is not released yet. Vendors are paid when each window closes.
            </p>
          </div>

          <button
            type="button"
            onClick={onRelease}
            disabled={release.isPending}
            className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            title="Pays out every line whose return window has closed. Runs automatically once a day; this is the manual fallback."
          >
            {release.isPending
              ? "Releasing…"
              : dueNow > 0
                ? `Release ${dueNow} due payout${dueNow === 1 ? "" : "s"}`
                : "Release due payouts"}
          </button>
        </div>

        {holding.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Nothing is being held right now.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Delivered</th>
                  <th className="py-2 pr-4 font-medium">Releases</th>
                  <th className="py-2 pr-5 font-medium">Policy</th>
                </tr>
              </thead>
              <tbody>
                {holding.map((line) => (
                  <tr
                    key={`${line.order}-${line.product}`}
                    className="border-t border-slate-100"
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/admin/orders/${line.order}`}
                        className="font-medium text-slate-900 underline"
                      >
                        #{line.order.slice(-8)}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {line.customer ?? "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      {line.name}
                      {line.quantity > 1 && (
                        <span className="text-xs text-slate-500"> ×{line.quantity}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {fmtDate(line.deliveredAt)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {line.due ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                          <FiCheckCircle className="h-3 w-3" /> due now
                        </span>
                      ) : (
                        <span className="text-slate-700">
                          {fmtDate(line.maturesAt)}
                          <span className="block text-xs text-slate-500">
                            in {daysUntil(line.maturesAt)}d
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 text-xs text-slate-500">
                      {POLICY_LABEL[line.returnPolicy] ?? line.returnPolicy}
                      {line.returnPolicy === "full" && ` · ${line.returnWindowDays}d`}
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
