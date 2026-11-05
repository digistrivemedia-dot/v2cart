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

// The three bands, slowest last. Order matters: it is the display order, and
// the ascending-days / non-decreasing-pct rule reads along it.
const BAND_KEYS = ["low", "medium", "high"] as const;
type BandKey = (typeof BAND_KEYS)[number];

type BandForm = Record<BandKey, { days: string; pct: string }>;

const EMPTY_BAND_FORM: BandForm = {
  low: { days: "", pct: "" },
  medium: { days: "", pct: "" },
  high: { days: "", pct: "" },
};

// `high` is the SLOWEST and best-paying band — the label tracks the
// percentage, not the speed. Phase 16's tiers meant the opposite.
const BAND_LABEL: Record<BandKey, string> = {
  low: "Low margin",
  medium: "Medium margin",
  high: "High margin",
};

const BAND_HINT: Record<BandKey, string> = {
  low: "fastest sale, smallest return",
  medium: "mid-pace",
  high: "slowest sale, biggest return",
};

const toBandForm = (bands: any): BandForm => {
  if (!bands) return EMPTY_BAND_FORM;
  const out = { ...EMPTY_BAND_FORM };
  for (const key of BAND_KEYS) {
    out[key] = {
      days: bands[key]?.days != null ? String(bands[key].days) : "",
      pct: bands[key]?.pct != null ? String(bands[key].pct) : "",
    };
  }
  return out;
};

const isFormEmpty = (form: BandForm) =>
  BAND_KEYS.every((k) => form[k].days.trim() === "" && form[k].pct.trim() === "");

const isFormComplete = (form: BandForm) =>
  BAND_KEYS.every((k) => form[k].days.trim() !== "" && form[k].pct.trim() !== "");

/**
 * Mirrors bandsError in backend/utils/marginBands.js. Duplicated only so a
 * typo is caught before a round-trip — the backend check is the authority and
 * runs regardless.
 */
function bandFormError(form: BandForm, maxPct: number): string | null {
  if (isFormEmpty(form)) return null;
  if (!isFormComplete(form)) {
    return "Fill in all three bands (days and %), or clear them all to use the platform defaults";
  }

  const n = BAND_KEYS.map((k) => ({
    key: k,
    days: Number(form[k].days),
    pct: Number(form[k].pct),
  }));

  for (const b of n) {
    if (!Number.isFinite(b.days) || b.days < 1) {
      return `The ${b.key} band's days must be at least 1`;
    }
    if (!Number.isFinite(b.pct) || b.pct < 0 || b.pct > 100) {
      return `The ${b.key} band's % must be between 0 and 100`;
    }
    if (b.pct > maxPct) {
      return `The ${b.key} band pays ${b.pct}%, more than this product's ${maxPct}% platform margin — the investor's return comes out of that margin`;
    }
  }

  const [low, medium, high] = n;
  if (!(low.days < medium.days && medium.days < high.days)) {
    return "Band days must increase: low < medium < high";
  }
  if (!(low.pct <= medium.pct && medium.pct <= high.pct)) {
    return "Band percentages cannot decrease — a longer wait must not pay less";
  }
  return null;
}

// Admin-only. Sets a product's listing price, the margin bands that decide what
// an investor earns on it, and whether the listing is visible. Since Phase 10
// the listing price is the only settable PRICE — the vendor's net and what an
// investor pays derive from it via the margin. What an investor is PAID is a
// separate question answered by the bands (Phase 20), and is a percentage of
// their capital rather than the whole margin.
//
// Deliberately self-contained (own fetches, own state) — does not touch the
// surrounding edit form's state so it can be dropped into any product
// detail/edit page.
export function ProductPricingPanel({ product, onUpdated }: ProductPricingPanelProps) {
  const { pricing, listingStatus } = useProductPricingMutation();
  const { settings } = usePricingSettings();

  const [price, setPrice] = useState(product.price?.toString() ?? "");
  const [investableUnits, setInvestableUnits] = useState(product.investableUnits?.toString() ?? "");

  // Empty string = follow the global margin; any number = override it.
  const [marginInput, setMarginInput] = useState(
    product.marginPct != null ? String(product.marginPct) : ""
  );
  const usesOverride = marginInput.trim() !== "";

  const effectiveMargin = usesOverride ? Number(marginInput) || 0 : settings.marginPct;

  // The bands actually in force, sent by the backend already resolved (the
  // product's own, else the platform defaults). Used as the placeholder set so
  // an admin who leaves the fields empty can still see what the product will
  // do — the Q4 answer: never block approval, always show the fallback.
  const resolvedBands = product.marginBands ?? null;
  const usesDefaultBands = product.usesDefaultBands ?? true;

  // Empty = use the platform defaults. Prefilled only when this product has
  // bands of its own, so clearing the fields is how admin goes back to them.
  const [bandForm, setBandForm] = useState<BandForm>(
    usesDefaultBands ? EMPTY_BAND_FORM : toBandForm(product.marginBands)
  );
  // Admin's starting band, before the product has sold anything.
  const [bandPick, setBandPick] = useState<string>(product.marginCategory ?? "");

  // Phase 21 — how long this product's money is held after delivery.
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

  const bandError = bandFormError(bandForm, effectiveMargin);
  const bandsOverridden = !isFormEmpty(bandForm);

  // The numbers that will apply after save: what admin typed, else the
  // resolved fallback the backend sent.
  const liveBands = BAND_KEYS.map((key) => {
    const typed = bandForm[key];
    const fallback = resolvedBands?.[key];
    return {
      key,
      days: typed.days.trim() !== "" ? Number(typed.days) : fallback?.days ?? null,
      pct: typed.pct.trim() !== "" ? Number(typed.pct) : fallback?.pct ?? null,
    };
  });

  // This panel has its OWN save button, separate from the page's main
  // "Update Product" submit — that button never sees these fields (they're
  // not part of that form). Surface a hard-to-miss warning if the admin has
  // typed a change here but hasn't clicked "Save Pricing" yet, so it can't
  // be silently lost by clicking the other button instead.
  const isDirty =
    price !== (product.price?.toString() ?? "") ||
    investableUnits !== (product.investableUnits?.toString() ?? "") ||
    marginInput !== (product.marginPct != null ? String(product.marginPct) : "") ||
    bandPick !== (product.marginCategory ?? "") ||
    JSON.stringify(bandForm) !==
      JSON.stringify(usesDefaultBands ? EMPTY_BAND_FORM : toBandForm(product.marginBands)) ||
    JSON.stringify(returnForm) !==
      JSON.stringify(toReturnPolicyForm(product, returnDefaults));

  // Everything below the listing price is derived, not typed — this mirrors
  // backend utils/pricingCalculator.js so admin sees the full split live.
  const derived = useMemo(() => {
    const listing = Number(price) || 0;
    const vendorNet = listing / (1 + effectiveMargin / 100);

    return {
      vendorNet,
      platformMargin: listing - vendorNet,
      investorPays: vendorNet,
      // The platform keeps the whole margin on a unit no investor funded, and
      // `margin − band%` on one they did. There is no single "investor
      // receives" figure any more: it depends on how long their unit takes to
      // sell, which is what the band table below spells out.
      profitWithoutInvestor: listing - vendorNet,
      // Investors already holding an unsold unit at a higher price get the
      // difference refunded the moment this saves.
      refundPerInvestor: Math.max((product.investorPrice ?? 0) - vendorNet, 0),
    };
  }, [price, effectiveMargin, product.investorPrice]);

  // What each band pays on the investor's capital, and what the platform keeps.
  // The honest version of one "investor receives ₹X" number.
  const bandOutcomes = liveBands.map((b) => {
    const payout = b.pct != null ? derived.investorPays * (1 + b.pct / 100) : null;
    return {
      ...b,
      payout,
      investorProfit: payout != null ? payout - derived.investorPays : null,
      platformKeeps: payout != null ? derived.platformMargin - (payout - derived.investorPays) : null,
    };
  });

  // null = clear this product's own bands and fall back to the platform
  // defaults; a complete set = use these numbers for this product alone.
  const bandsPayload = () =>
    isFormEmpty(bandForm)
      ? null
      : {
          low: { days: Number(bandForm.low.days), pct: Number(bandForm.low.pct) },
          medium: { days: Number(bandForm.medium.days), pct: Number(bandForm.medium.pct) },
          high: { days: Number(bandForm.high.days), pct: Number(bandForm.high.pct) },
        };

  const handleSavePricing = async () => {
    if (!price || Number(price) <= 0) {
      toast.error("Customer price is required");
      return;
    }

    if (bandError) {
      toast.error(bandError);
      return;
    }

    if (returnError) {
      toast.error(returnError);
      return;
    }

    if (derived.refundPerInvestor >= 1) {
      const ok = window.confirm(
        `This lowers the investor price to ₹${derived.investorPays.toFixed(2)}. Every investor `
          + `holding an unsold unit of this product will be refunded `
          + `₹${derived.refundPerInvestor.toFixed(2)} to their original payment method. `
          + `This cannot be undone. Continue?`
      );
      if (!ok) return;
    }

    try {
      const updated = await pricing.mutateAsync({
        productId: product._id,
        data: {
          price: Number(price),
          // null explicitly clears the override back to the global margin.
          marginPct: usesOverride ? Number(marginInput) : null,
          investableUnits: investableUnits ? Number(investableUnits) : null,
          marginBands: bandsPayload(),
          marginCategory: bandPick === "" ? null : (bandPick as any),
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
    // Publishing is the moment admin decides what investors earn, so the bands
    // ride along rather than needing a separate save first. A band typo must
    // not go live silently.
    if (status === "live" && bandError) {
      toast.error(bandError);
      return;
    }

    try {
      const updated = await listingStatus.mutateAsync({
        productId: product._id,
        data: {
          listingStatus: status,
          ...(status === "live"
            ? { marginBands: bandsPayload(), marginCategory: bandPick === "" ? null : (bandPick as any) }
            : {}),
        },
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
            <span className="font-medium text-amber-700"> This panel has its own Save Pricing button below — the page's Update Product button at the bottom does not save these fields.</span>
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
            {/* Phase 17 warned here that a product CATEGORY's tier % was
                overruling this field. Categories carry no margin any more, so
                nothing can overrule it and the warning is gone. */}
            <p className="mt-1.5 text-xs text-slate-500">
              {usesOverride ? (
                <>
                  Overriding the global {settings.marginPct}% — changing the global margin will no
                  longer move this product.
                </>
              ) : (
                <>
                  Empty = follows the global {settings.marginPct}%. Type a number to override it for
                  this product only.
                </>
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Investable Units (optional, defaults to stock)</label>
            <input
              type="number"
              value={investableUnits}
              onChange={(e) => setInvestableUnits(e.target.value)}
              placeholder={product.stock?.toString()}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* ── Margin rules for THIS product ──────────────────────────────
            The rules admin sets at approval: how fast a unit has to sell to
            land in each band, and what the investor earns there. Per product,
            because an iPhone 15 and an iPhone 14 want different numbers. */}
        <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Margin rules for this product</p>
              <p className="mt-0.5 text-xs text-slate-500">
                How long a unit takes to sell decides what the investor earns. A faster sale earns
                less (their capital came back quickly); a slower one earns more.
              </p>
            </div>
            {bandsOverridden ? (
              <button
                type="button"
                onClick={() => setBandForm(EMPTY_BAND_FORM)}
                title="Clear these rules and use the platform defaults again"
                className="flex-shrink-0 cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Use defaults
              </button>
            ) : (
              <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                using platform defaults
              </span>
            )}
          </div>

          {/* Leaving the fields empty is a legitimate choice, so the numbers
              that will actually apply are shown as placeholders rather than
              left blank — admin can see what they are accepting. */}
          {!bandsOverridden && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Leave these empty and this product uses the platform defaults:{" "}
              {liveBands
                .map((b) => `${b.days ?? "—"}d → ${b.pct ?? "—"}%`)
                .join(" · ")}
              . Type your own numbers to override them for this product only.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {BAND_KEYS.map((key) => (
              <div key={key} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-slate-700">{BAND_LABEL[key]}</p>
                  <p className="text-[11px] text-slate-500">{BAND_HINT[key]}</p>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                    {key === "high" ? "Days (and slower)" : "Sells within (days)"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bandForm[key].days}
                    onChange={(e) =>
                      setBandForm({
                        ...bandForm,
                        [key]: { ...bandForm[key], days: e.target.value },
                      })
                    }
                    placeholder={resolvedBands?.[key]?.days != null ? String(resolvedBands[key].days) : ""}
                    className="w-full sm:w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                    Investor earns (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={bandForm[key].pct}
                    onChange={(e) =>
                      setBandForm({
                        ...bandForm,
                        [key]: { ...bandForm[key], pct: e.target.value },
                      })
                    }
                    placeholder={resolvedBands?.[key]?.pct != null ? String(resolvedBands[key].pct) : ""}
                    className="w-full sm:w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            ))}
          </div>

          {bandError && (
            <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-red-700">
              <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{bandError}</span>
            </p>
          )}

          <p className="mt-3 text-xs text-slate-500">
            The investor&apos;s return is paid out of this product&apos;s {effectiveMargin}% platform
            margin, so no band can exceed it — the rest is yours. The customer&apos;s price and the
            vendor&apos;s payout are never affected by these numbers.
          </p>

          {/* The starting band. Decides nothing financial — it is the forecast
              investors shop by until the product has actually sold units. */}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Starting band
            </label>
            <div className="flex flex-wrap gap-2">
              {BAND_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBandPick(key)}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    bandPick === key
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {BAND_LABEL[key]}
                </button>
              ))}
              {bandPick !== "" && (
                <button
                  type="button"
                  onClick={() => setBandPick("")}
                  className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Where this product sits until it has sold something — a forecast for investors
              browsing, not a payout. Pick any band regardless of sales. Once units start selling,
              the observed sell time takes over; while it is still unsold, the clock since going
              live can only move it to a slower band, never a faster one.
              {product.observedSales > 0 && (
                <>
                  {" "}
                  <span className="font-medium text-slate-700">
                    This product has {product.observedSales} sold unit(s), so its measured sell time
                    is already in charge.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Phase 21 — when this product's money is released. Sits next to the
            bands because the two together are the whole investor deal: the
            bands say how much, this says when. */}
        <ReturnPolicyFields
          value={returnForm}
          onChange={setReturnForm}
          defaults={returnDefaults}
          usingDefault={usesDefaultReturnPolicy}
        />

        {/* Derived split — all of it follows from the listing price above */}
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Derived at {effectiveMargin}% margin
            {usesOverride && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-blue-800">
                product override
              </span>
            )}
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Vendor receives</p>
              <p className="text-xl font-semibold text-slate-900">₹{derived.vendorNet.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Investor pays</p>
              <p className="text-xl font-semibold text-slate-900">₹{derived.investorPays.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Customer pays</p>
              <p className="text-xl font-semibold text-slate-900">₹{(Number(price) || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Platform margin</p>
              <p className="text-xl font-semibold text-slate-900">₹{derived.platformMargin.toFixed(2)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">split with the investor below</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
              What a funded unit pays out, by how long it takes to sell
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-medium">Band</th>
                    <th className="pb-2 font-medium">Sells within</th>
                    <th className="pb-2 font-medium">Investor earns</th>
                    <th className="pb-2 font-medium">Investor receives</th>
                    <th className="pb-2 font-medium">You keep</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bandOutcomes.map((b) => (
                    <tr key={b.key}>
                      <td className="py-2 font-medium text-slate-800">{BAND_LABEL[b.key]}</td>
                      <td className="py-2 text-slate-600">
                        {b.key === "high"
                          ? `over ${bandOutcomes[1].days ?? "—"} days`
                          : `${b.days ?? "—"} days`}
                      </td>
                      <td className="py-2 text-slate-600">{b.pct ?? "—"}%</td>
                      <td className="py-2 font-semibold text-slate-900">
                        {b.payout != null ? `₹${b.payout.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2 font-semibold text-slate-900">
                        {b.platformKeeps != null ? `₹${b.platformKeeps.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100/60">
                    <td className="py-2 font-medium text-slate-800" colSpan={3}>
                      No investor funded the unit
                    </td>
                    <td className="py-2 text-slate-500">—</td>
                    <td className="py-2 font-semibold text-slate-900">
                      ₹{derived.profitWithoutInvestor.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Each investor is paid on how long <em>their own</em> unit took to sell, against the
              rules in force when they invested — so two investors in this product can earn
              different amounts. Changing the rules above never affects an investment that already
              exists.
            </p>
          </div>

          {derived.refundPerInvestor >= 1 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Saving this refunds ₹{derived.refundPerInvestor.toFixed(2)} to every investor holding an
              unsold unit of this product (investor price drops from
              ₹{(product.investorPrice ?? 0).toFixed(2)} to ₹{derived.investorPays.toFixed(2)}).
            </p>
          )}
        </div>

        {isDirty && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
            Unsaved pricing changes — click "Save Pricing" below to keep them, or they'll be lost.
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
