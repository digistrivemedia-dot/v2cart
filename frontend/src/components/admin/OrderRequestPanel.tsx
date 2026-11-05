"use client";

/**
 * The admin decision on a customer's cancellation or return request — Phase 22.
 *
 * Sits above the status manager on /admin/orders/:id, because deciding a
 * request IS the status change: approving dispatches into the same Phase 21
 * cancel/return/replace flows the manual control uses, with the items the
 * customer actually named.
 *
 * Approving moves real money, so it confirms first and spells out what will
 * happen. Rejecting requires a note — the customer is shown it, and "declined"
 * on its own tells them nothing.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiExternalLink,
} from "react-icons/fi";
import {
  useOrderRequestForOrder,
  useDecideOrderRequest,
} from "@/hooks/order/useOrderRequest";

export function OrderRequestPanel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data: request, isLoading, refetch } = useOrderRequestForOrder(orderId);
  const decide = useDecideOrderRequest();

  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"approved" | "rejected" | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (isLoading || !request) return null;

  const isCancel = request.type === "cancel";
  const label = isCancel ? "Cancellation" : "Return";
  const pending = request.status === "pending";

  // What approving will actually do, in the words of the thing it does.
  const outcome = isCancel
    ? "The order is cancelled, stock is restored, and any settled money is reversed."
    : request.mode === "replacement"
      ? "The order is marked Replaced. No money moves — the vendor is still paid and one more unit leaves stock."
      : "The customer is refunded their full charge, nobody is paid, and each investor's unit goes back in the pool to sell again.";

  const submit = async (status: "approved" | "rejected") => {
    if (status === "rejected" && !note.trim()) {
      toast.error("Please give a reason — the customer is shown it");
      return;
    }
    try {
      const result = await decide.mutateAsync({
        requestId: request._id,
        status,
        adminNote: note.trim() || undefined,
      });
      toast.success(result.message);
      if (result.refund?.error) {
        toast.error(`The refund could not be sent: ${result.refund.error}`);
      }
      if (result.reversalFailures?.length) {
        toast.error(
          `${result.reversalFailures.length} line(s) could not be reversed — settle them by hand`
        );
      }
      setConfirming(null);
      setNote("");
      refetch();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record your decision");
    }
  };

  const tone = pending
    ? { bg: "bg-amber-50", border: "border-amber-300", Icon: FiClock, text: "text-amber-900" }
    : request.status === "approved"
      ? { bg: "bg-emerald-50", border: "border-emerald-200", Icon: FiCheckCircle, text: "text-emerald-900" }
      : { bg: "bg-red-50", border: "border-red-200", Icon: FiXCircle, text: "text-red-900" };

  return (
    <div className={`rounded-xl border-2 p-5 sm:p-6 ${tone.bg} ${tone.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`flex items-center gap-2 text-lg font-bold ${tone.text}`}>
            <tone.Icon className="h-5 w-5" />
            {label} request
            {!pending && (
              <span className="text-sm font-medium">· {request.status}</span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {request.user?.name || "Customer"}
            {request.user?.email && ` · ${request.user.email}`}
            {" · "}
            {new Date(request.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>

        {request.mode && (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {request.mode}
          </span>
        )}
      </div>

      {/* ── what they said ── */}
      <div className="mt-4 rounded-lg bg-white/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Customer&apos;s message
        </p>
        <p className="mt-1 text-sm text-slate-900">{request.reason}</p>

        {request.items.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Items ({request.items.length})
            </p>
            <ul className="mt-1 space-y-0.5">
              {request.items.map((item) => (
                <li key={item.product} className="text-sm text-slate-700">
                  {item.name}
                  {item.quantity > 1 && <span className="text-slate-500"> ×{item.quantity}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {request.images.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Photos ({request.images.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {request.images.map((img) => (
                <button
                  key={img.public_id}
                  type="button"
                  onClick={() => setLightbox(img.url)}
                  className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 transition-transform hover:scale-105"
                  title="Click to enlarge"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="Customer photo" className="h-20 w-20 object-cover" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── already decided ── */}
      {!pending && (
        <div className="mt-4 text-sm text-slate-700">
          {request.adminNote && (
            <p>
              <span className="font-medium">Your note:</span> {request.adminNote}
            </p>
          )}
          {request.decidedAt && (
            <p className="mt-0.5 text-xs text-slate-500">
              Decided {new Date(request.decidedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
        </div>
      )}

      {/* ── the decision ── */}
      {pending && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-white/80 p-3 text-xs text-slate-700">
            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <span className="font-semibold">Approving will:</span> {outcome}
            </span>
          </div>

          {/* Phase 22 — while this sits pending, the order's payouts are
              frozen, so a request nobody decides freezes a vendor's money. */}
          <p className="text-xs text-slate-600">
            This order&apos;s vendor and investor payouts are paused until you decide.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Note to the customer{" "}
              <span className="font-normal text-slate-500">
                (required to decline — they are shown it)
              </span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Photos confirm the damage — refund approved."
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {confirming ? (
            <div className="rounded-lg border border-slate-300 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">
                {confirming === "approved"
                  ? `Approve this ${label.toLowerCase()}?`
                  : `Decline this ${label.toLowerCase()}?`}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {confirming === "approved"
                  ? outcome
                  : "The order is left exactly as it is, and the customer cannot submit another request on it."}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => submit(confirming)}
                  disabled={decide.isPending}
                  className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                    confirming === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {decide.isPending ? "Saving…" : `Yes, ${confirming === "approved" ? "approve" : "decline"}`}
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  disabled={decide.isPending}
                  className="flex-1 cursor-pointer rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                >
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming("approved")}
                className="flex-1 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                onClick={() => setConfirming("rejected")}
                className="flex-1 cursor-pointer rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Customer photo" className="max-h-[90vh] max-w-full rounded-lg" />
          <a
            href={lightbox}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900"
          >
            <FiExternalLink className="h-4 w-4" /> Open full size
          </a>
        </div>
      )}
    </div>
  );
}
