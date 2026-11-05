"use client";

/**
 * The customer's cancel / return form — Phase 22.
 *
 * One component for both, because they are the same shape and differ in three
 * details: a return names items, offers refund-or-replacement where the policy
 * allows both, and takes photos. A cancel is a reason box.
 *
 * Which of the two is even possible is decided server-side and arrives as
 * `allowedType`, so nothing here re-implements an eligibility rule — the
 * per-item `eligible` / `modes` / `reason` come pre-resolved too.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FiX, FiUploadCloud, FiAlertTriangle, FiTrash2 } from "react-icons/fi";
import {
  useCreateOrderRequest,
  type RequestItem,
  type RequestMode,
  type RequestType,
} from "@/hooks/order/useOrderRequest";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  orderId: string;
  type: RequestType;
  items: RequestItem[];
  maxImages: number;
  onClose: () => void;
  onDone?: () => void;
}

export function RequestOrderActionModal({
  orderId,
  type,
  items,
  maxImages,
  onClose,
  onDone,
}: Props) {
  const create = useCreateOrderRequest(orderId);

  const eligible = useMemo(() => items.filter((i) => i.eligible), [items]);
  const ineligible = useMemo(() => items.filter((i) => !i.eligible), [items]);

  // Pre-ticked when there is only one thing to return — the common case, and
  // one less click on a form the customer is already annoyed to be filling in.
  const [selected, setSelected] = useState<string[]>(
    eligible.length === 1 ? [eligible[0].product] : []
  );
  const [mode, setMode] = useState<RequestMode | null>(null);
  const [reason, setReason] = useState("");
  const [images, setImages] = useState<{ dataUri: string; name: string }[]>([]);

  /**
   * The modes EVERY selected item allows. A refund and a replacement-only item
   * together leave only `replacement`, and that has to be what is offered —
   * the server enforces the same intersection, so showing anything else would
   * be offering a button that fails.
   */
  const sharedModes = useMemo<RequestMode[]>(() => {
    const picked = eligible.filter((i) => selected.includes(i.product));
    if (picked.length === 0) return [];
    return (["refund", "replacement"] as RequestMode[]).filter((m) =>
      picked.every((i) => i.modes.includes(m))
    );
  }, [eligible, selected]);

  // Only asked when there is a genuine choice. One option needs no question,
  // and the server fills it in.
  const needsModeChoice = sharedModes.length > 1;
  const effectiveMode = needsModeChoice ? mode : sharedModes[0] ?? null;

  const toggleItem = (productId: string) => {
    setSelected((prev) =>
      prev.includes(productId) ? prev.filter((p) => p !== productId) : [...prev, productId]
    );
    // The shared modes may have just changed under the old pick.
    setMode(null);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = maxImages - images.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${maxImages} photos`);
      return;
    }

    const accepted: { dataUri: string; name: string }[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name} is not a JPEG, PNG or WebP`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 5MB`);
        continue;
      }
      accepted.push({
        dataUri: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
        name: file.name,
      });
    }
    setImages((prev) => [...prev, ...accepted]);
  };

  const submit = async () => {
    if (!reason.trim()) {
      toast.error(type === "cancel" ? "Please tell us why" : "Please tell us what is wrong");
      return;
    }
    if (type === "return") {
      if (selected.length === 0) {
        toast.error("Select at least one item to return");
        return;
      }
      if (needsModeChoice && !mode) {
        toast.error("Choose a refund or a replacement");
        return;
      }
    }

    try {
      const result = await create.mutateAsync({
        type,
        ...(type === "return"
          ? {
              items: selected,
              mode: effectiveMode,
              images: images.map((i) => i.dataUri),
            }
          : {}),
        reason: reason.trim(),
      });
      toast.success(result.message);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request");
    }
  };

  const isReturn = type === "return";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {isReturn ? "Return this order" : "Cancel this order"}
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {isReturn
              ? "We'll review your request and get back to you. Nothing is sent back until it's approved."
              : "We'll review your request. Your refund is issued once it's approved."}
          </p>

          {/* ── items, returns only ── */}
          {isReturn && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-900">
                What are you sending back?
              </p>
              <div className="space-y-2">
                {eligible.map((item) => (
                  <label
                    key={item.product}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                      selected.includes(item.product)
                        ? "border-orange-500 bg-orange-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(item.product)}
                      onChange={() => toggleItem(item.product)}
                      className="mt-0.5 h-4 w-4 accent-orange-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {item.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        Qty {item.quantity}
                        {item.modes.length === 1 && item.modes[0] === "replacement" && (
                          <> · replacement only</>
                        )}
                      </span>
                    </span>
                  </label>
                ))}

                {/* Shown, not hidden: the customer should learn WHY their
                    memory card cannot come back, not wonder where it went. */}
                {ineligible.map((item) => (
                  <div
                    key={item.product}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 opacity-80"
                  >
                    <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-600 line-through">
                        {item.name}
                      </span>
                      <span className="block text-xs text-slate-500">{item.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── refund or replacement, only when both are possible ── */}
          {isReturn && needsModeChoice && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-900">What would you like?</p>
              <div className="grid grid-cols-2 gap-2">
                {sharedModes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                      mode === m
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {m === "refund" ? "Refund" : "Replacement"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isReturn && !needsModeChoice && sharedModes.length === 1 && selected.length > 0 && (
            <p className="text-xs text-slate-600">
              {sharedModes[0] === "replacement"
                ? "These items are eligible for a replacement."
                : "You'll be refunded for these items."}
            </p>
          )}

          {/* ── reason ── */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900">
              {isReturn ? "What's wrong with it?" : "Why are you cancelling?"}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                isReturn
                  ? "Tell us what happened — arrived damaged, wrong item, not as described…"
                  : "Changed my mind, ordered by mistake, found it cheaper…"
              }
              className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{reason.length}/1000</p>
          </div>

          {/* ── photos, returns only ── */}
          {isReturn && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900">
                Photos <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <p className="mb-2 text-xs text-slate-500">
                If it arrived damaged or broken, a photo helps us approve this faster.
              </p>

              {images.length < maxImages && (
                <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 hover:border-orange-400 hover:bg-orange-50/40">
                  <FiUploadCloud className="h-6 w-6 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">
                    Add photos
                  </span>
                  <span className="text-xs text-slate-500">
                    JPEG, PNG or WebP · up to 5MB · {maxImages - images.length} left
                  </span>
                  <input
                    type="file"
                    accept={ACCEPTED.join(",")}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}

              {images.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="group relative overflow-hidden rounded-lg border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.dataUri} alt={img.name} className="h-20 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute right-1 top-1 cursor-pointer rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Remove ${img.name}`}
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <button
            onClick={onClose}
            disabled={create.isPending}
            className="flex-1 cursor-pointer rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
          >
            Never mind
          </button>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="flex-1 cursor-pointer rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {create.isPending ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
