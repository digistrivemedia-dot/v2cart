"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FiCheckCircle, FiPauseCircle, FiXCircle, FiAlertTriangle } from "react-icons/fi";
import { useProductPricingMutation } from "@/hooks/product/mutations/useProductPricingMutation";
import { usePricingSettings } from "@/hooks/admin";
import {
  ReturnPolicyFields,
  toReturnPolicyForm,
  returnPolicyFormError,
  returnPolicyPayload,
  type ReturnPolicyForm,
} from "@/components/admin/ReturnPolicyFields";

interface ProductPricingPanelProps {
  product: any;
  onUpdated?: (product: any) => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  live: "Live",
  rejected: "Rejected",
  paused: "Paused",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  live: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  paused: "bg-slate-200 text-slate-700",
};

export function ProductPricingPanel({ product, onUpdated }: ProductPricingPanelProps) {
  const { pricing, listingStatus } = useProductPricingMutation();
  const { settings } = usePricingSettings();

  const [price, setPrice] = useState(product.price?.toString() ?? "");

  const [marginInput, setMarginInput] = useState(
    product.marginPct != null ? String(product.marginPct) : ""
  );
  const usesOverride = marginInput.trim() !== "";
  const effectiveMargin = usesOverride ? Number(marginInput) || 0 : settings.marginPct;

  const returnDefaults = {
    policy: (settings.defaultReturnPolicy ?? "full") as any,
    windowDays: settings.defaultReturnWindowDays ?? 7,
  };
  const usesDefaultReturnPolicy =
    product.returnPolicy == null && product.returnWindowDays == null;
  const [returnForm, setReturnForm] = useState<ReturnPolicyForm>(
    toReturnPolicyForm(product, returnDefaults)
  );
  const returnError = returnPolicyFormError(returnForm);

  const isDirty =
    price !== (product.price?.toString() ?? "") ||
    marginInput !== (product.marginPct != null ? String(product.marginPct) : "") ||
    JSON.stringify(returnForm) !==
      JSON.stringify(toReturnPolicyForm(product, returnDefaults));

  const derived = useMemo(() => {
    const listing = Number(price) || 0;
    const vendorNet = listing / (1 + effectiveMargin / 100);
    return {
      vendorNet,
      platformMargin: listing - vendorNet,
    };
  }, [price, effectiveMargin]);

  const handleSavePricing = async () => {
    if (!price || Number(price) <= 0) {
      toast.error("Customer price is required");
      return;
    }
    if (returnError) {
      toast.error(returnError);
      return;
    }
    try {
      const updated = await pricing.mutateAsync({
        productId: product._id,
        data: {
          price: Number(price),
          marginPct: usesOverride ? Number(marginInput) : null,
          ...returnPolicyPayload(returnForm),
        },
      });
      toast.success("Pricing updated");
      onUpdated?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update pricing");
    }
  };

  const handleSetListingStatus = async (status: "live" | "rejected" | "paused" | "draft") => {
    try {
      const updated = await listingStatus.mutateAsync({
        productId: product._id,
        data: { listingStatus: status },
      });
      toast.success(`Listing marked ${STATUS_LABEL[status]}`);
      onUpdated?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update listing status");
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-8">
      <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-medium text-slate-900">Admin Pricing</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Set this product&apos;s listing price, and optionally a margin that applies to it alone
            instead of the global {settings.marginPct}%. This product is currently priced at{" "}
            <span className="font-medium text-slate-700">{effectiveMargin}%</span>
            {usesOverride ? " from its own override." : " from the global margin."}
            <span className="font-medium text-amber-700"> This panel has its own Save Pricing button — the page&apos;s Update Product button does not save these fields.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[product.listingStatus] || STATUS_COLOR.draft}`}>
            {STATUS_LABEL[product.listingStatus] || "Draft"}
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Listing Price (customer pays) *</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="120"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              The vendor normally sets this. Changing it here changes what they&apos;re paid.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Margin % for this product
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="any"
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                placeholder={`${settings.marginPct} (global)`}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
              {usesOverride && (
                <button
                  type="button"
                  onClick={() => setMarginInput("")}
                  title="Clear the override and follow the global margin again"
                  className="flex-shrink-0 cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Use global
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {usesOverride ? (
                <>Overriding the global {settings.marginPct}% — changing the global margin will no longer move this product.</>
              ) : (
                <>Empty = follows the global {settings.marginPct}%. Type a number to override it for this product only.</>
              )}
            </p>
          </div>
        </div>

        <ReturnPolicyFields
          value={returnForm}
          onChange={setReturnForm}
          defaults={returnDefaults}
          usingDefault={usesDefaultReturnPolicy}
        />

        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Derived at {effectiveMargin}% margin
            {usesOverride && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-blue-800">
                product override
              </span>
            )}
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Vendor receives</p>
              <p className="text-xl font-semibold text-slate-900">₹{derived.vendorNet.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Customer pays</p>
              <p className="text-xl font-semibold text-slate-900">₹{(Number(price) || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Platform margin</p>
              <p className="text-xl font-semibold text-slate-900">₹{derived.platformMargin.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {isDirty && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
            Unsaved pricing changes — click &quot;Save Pricing&quot; below to keep them.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSavePricing}
            disabled={pricing.isPending}
            className={`px-5 py-2.5 rounded-xl transition-all text-sm font-medium disabled:opacity-50 ${
              isDirty ? "bg-amber-600 text-white hover:bg-amber-700 ring-2 ring-amber-300" : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            {pricing.isPending ? "Saving..." : isDirty ? "Save Pricing (unsaved changes)" : "Save Pricing"}
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => handleSetListingStatus("live")}
            disabled={listingStatus.isPending || product.pricingStatus !== "priced"}
            title={product.pricingStatus !== "priced" ? "Save pricing before publishing" : undefined}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FiCheckCircle className="w-4 h-4" /> Publish (Live)
          </button>

          <button
            type="button"
            onClick={() => handleSetListingStatus("paused")}
            disabled={listingStatus.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all text-sm font-medium disabled:opacity-40"
          >
            <FiPauseCircle className="w-4 h-4" /> Pause
          </button>

          <button
            type="button"
            onClick={() => handleSetListingStatus("rejected")}
            disabled={listingStatus.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 transition-all text-sm font-medium disabled:opacity-40"
          >
            <FiXCircle className="w-4 h-4" /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}
