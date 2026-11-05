"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { HiCurrencyRupee } from "react-icons/hi";
import { FiLock, FiUnlock } from "react-icons/fi";
import {
  usePricingSettings,
  useUpdatePricingSettings,
  useUpdateDefaultMarginBands,
} from "@/hooks/admin";
import { vendorNetFromListing, customerTotal } from "@/lib/pricing";

const BAND_KEYS = ["low", "medium", "high"] as const;
type BandKey = (typeof BAND_KEYS)[number];

const BAND_LABEL: Record<BandKey, string> = {
  low: "Low margin",
  medium: "Medium margin",
  high: "High margin",
};

// Admin-only. Sets the two platform-wide rates:
//
//   • marginPct — carved OUT OF each vendor's listing price, and therefore
//     also the investor's return (MARKETPLACE_CONVERSION_PLAN.md Phase 10).
//     Changing it reprices the whole catalogue and can refund investors.
//   • gstPct — added ON TOP of the listing price at checkout. Changing it
//     reprices nothing: it moves no one's cut, only what the customer is
//     charged. It used to be hardcoded as `* 0.18` in three places.
//
// Self-contained (own fetch/state) so it drops into the products page without
// touching its existing logic.
export function GlobalPricingBar() {
  const { settings, isLoading } = usePricingSettings();
  const { updateSettings, isPending } = useUpdatePricingSettings();
  const { updateBands, isPending: bandsSaving } = useUpdateDefaultMarginBands();

  const [marginPct, setMarginPct] = useState("");
  const [gstPct, setGstPct] = useState("");
  const [isLocked, setIsLocked] = useState(true);

  // The default bands, as typed. Separate save from the margin above, because
  // the two have completely different consequences: the margin reprices the
  // catalogue and refunds investors, these move no money at all.
  const [bandForm, setBandForm] = useState<Record<BandKey, { days: string; pct: string }>>({
    low: { days: "", pct: "" },
    medium: { days: "", pct: "" },
    high: { days: "", pct: "" },
  });

  // Track if we have performed initial sync from server
  const hasSyncedRef = useRef(false);
  const marginInputRef = useRef<HTMLInputElement>(null);

  // Sync settings when loaded from server (only when locked to avoid overwriting active typing)
  useEffect(() => {
    if (!isLoading && settings) {
      if (!hasSyncedRef.current || isLocked) {
        setMarginPct(settings.marginPct !== undefined ? settings.marginPct.toString() : "0");
        setGstPct(settings.gstPct !== undefined ? settings.gstPct.toString() : "0");
        const b = settings.defaultMarginBands;
        if (b) {
          setBandForm({
            low: { days: String(b.low.days), pct: String(b.low.pct) },
            medium: { days: String(b.medium.days), pct: String(b.medium.pct) },
            high: { days: String(b.high.days), pct: String(b.high.pct) },
          });
        }
        hasSyncedRef.current = true;
      }
    }
  }, [isLoading, settings, isLocked]);

  // Only disable when actively saving or when user has locked it
  const fieldsDisabled = isPending || isLocked;

  const unlockAndFocus = () => {
    if (isLocked) {
      setIsLocked(false);
      toast.info("Unlocked — you can edit the margin now");
      setTimeout(() => {
        marginInputRef.current?.focus();
        marginInputRef.current?.select();
      }, 50);
    }
  };

  const toggleLock = () => {
    if (isLocked) {
      unlockAndFocus();
    } else {
      setIsLocked(true);
      toast.info("Locked");
    }
  };

  // Worked example at the rates currently typed in, so admin sees who
  // gets what before applying it to the whole catalogue. Uses the shared
  // formulas rather than inline arithmetic, so this preview cannot disagree
  // with what the backend will actually compute.
  const pct = Number(marginPct) || 0;
  const gst = Number(gstPct) || 0;
  const vendorNet = vendorNetFromListing(120, { marginPct: pct });
  const example = customerTotal(120, { gstPct: gst });

  // Mirrors bandsError in backend/utils/marginBands.js. The server check is
  // the authority; this just catches a typo before the round-trip.
  const bandError = (() => {
    const n = BAND_KEYS.map((k) => ({
      key: k,
      days: Number(bandForm[k].days),
      pct: Number(bandForm[k].pct),
    }));
    if (n.some((b) => bandForm[b.key].days === "" || bandForm[b.key].pct === "")) {
      return "All three bands need a day count and a percentage.";
    }
    for (const b of n) {
      if (!Number.isFinite(b.days) || b.days < 1) return `The ${b.key} band's days must be at least 1.`;
      if (!Number.isFinite(b.pct) || b.pct < 0 || b.pct > 100) {
        return `The ${b.key} band's % must be between 0 and 100.`;
      }
      // The investor's return is paid out of the platform margin, so a band
      // above it would have the platform funding returns out of pocket.
      if (b.pct > pct) {
        return `The ${b.key} band pays ${b.pct}%, more than the ${pct}% platform margin it comes out of.`;
      }
    }
    const [low, medium, high] = n;
    if (!(low.days < medium.days && medium.days < high.days)) {
      return "Band days must increase: low < medium < high.";
    }
    if (!(low.pct <= medium.pct && medium.pct <= high.pct)) {
      return "Band percentages cannot decrease — a longer wait must not pay less.";
    }
    return null;
  })();

  const handleSaveBands = () => {
    if (bandError) {
      toast.error(bandError);
      return;
    }
    updateBands({
      low: { days: Number(bandForm.low.days), pct: Number(bandForm.low.pct) },
      medium: { days: Number(bandForm.medium.days), pct: Number(bandForm.medium.pct) },
      high: { days: Number(bandForm.high.days), pct: Number(bandForm.high.pct) },
    });
  };

  const handleSave = () => {
    if (isLocked) return;

    // RAISING the margin is what triggers refunds, not lowering it: a bigger
    // margin means listingPrice/(1+margin) is smaller, so every investor
    // holding an unsold unit paid more than the new price and gets the
    // difference back on their card. It also cuts what vendors take home.
    if (pct > settings.marginPct) {
      const ok = window.confirm(
        `Raising the margin from ${settings.marginPct}% to ${pct}% will:\n\n`
          + `• refund every investor holding an unsold unit, to their wallet\n`
          + `• reduce what every vendor receives per sale\n`
          + `• enlarge the pot each product's margin bands are paid out of\n\n`
          + `Customer prices do not change, and no band percentage changes. `
          + `This cannot be undone. Continue?`
      );
      if (!ok) return;
    }

    if (gst < 0 || gst > 100) {
      toast.error("GST must be between 0 and 100%");
      return;
    }

    updateSettings(
      { marginPct: pct, gstPct: gst },
      {
        onSuccess: (data) => {
          setIsLocked(true);
          if (data?.settings) {
            setMarginPct(data.settings.marginPct?.toString() ?? "0");
            setGstPct(data.settings.gstPct?.toString() ?? "0");
          }
        },
      }
    );
  };

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border-2 p-5 transition-colors ${
        isLocked ? "border-slate-200" : "border-amber-400 bg-amber-50/20"
      }`}
      style={{ colorScheme: "light" }}
    >
      {/* Header bar with title and unlock toggle button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
            <HiCurrencyRupee className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-sm">Platform Margin &amp; GST</h2>
              {isLocked ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  <FiLock className="w-3 h-3" /> Locked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                  <FiUnlock className="w-3 h-3" /> Editing Enabled
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Margin is your cut of every vendor&apos;s listing price. The investor&apos;s return
              is paid out of it — how much depends on each product&apos;s margin bands below — and
              you keep the rest. GST is added on top at checkout and belongs to neither of you.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleLock}
          aria-pressed={!isLocked}
          className={`relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
            isLocked
              ? "bg-slate-800 text-white hover:bg-slate-700 shadow-sm"
              : "bg-amber-500 text-white hover:bg-amber-600 shadow-md"
          }`}
        >
          {isLocked ? <FiLock className="w-3.5 h-3.5" /> : <FiUnlock className="w-3.5 h-3.5" />}
          <span>{isLocked ? "Click to Unlock" : "Lock Input"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        {/* Margin % */}
        <div>
          <label
            htmlFor="globalMarginPct"
            onClick={() => isLocked && unlockAndFocus()}
            className="block text-xs font-semibold text-slate-700 mb-1.5 cursor-pointer"
          >
            Platform Margin %
          </label>
          <div className="relative cursor-text" onClick={() => isLocked && unlockAndFocus()}>
            <input
              ref={marginInputRef}
              id="globalMarginPct"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
              placeholder="0"
              disabled={fieldsDisabled}
              style={{ colorScheme: "light" }}
              className="w-full pl-3 pr-8 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
              %
            </span>
          </div>
        </div>

        {/* GST % — changing this reprices nothing, so it needs no warning */}
        <div>
          <label
            htmlFor="globalGstPct"
            onClick={() => isLocked && unlockAndFocus()}
            className="block text-xs font-semibold text-slate-700 mb-1.5 cursor-pointer"
          >
            GST %
            <span className="ml-1 font-normal text-slate-400">— added at checkout</span>
          </label>
          <div className="relative cursor-text" onClick={() => isLocked && unlockAndFocus()}>
            <input
              id="globalGstPct"
              type="number"
              min="0"
              max="100"
              step="any"
              inputMode="decimal"
              value={gstPct}
              onChange={(e) => setGstPct(e.target.value)}
              placeholder="18"
              disabled={fieldsDisabled}
              style={{ colorScheme: "light" }}
              className="w-full pl-3 pr-8 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
              %
            </span>
          </div>
        </div>

        {/* Worked example at the typed rates */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            On a ₹120 listing
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            Vendor gets <strong>₹{vendorNet.toFixed(2)}</strong> · you keep{" "}
            <strong>₹{(120 - vendorNet).toFixed(2)}</strong> · customer pays{" "}
            <strong>₹{example.total.toFixed(2)}</strong> (₹120 + ₹{example.gst.toFixed(2)} GST)
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Investor pays ₹{vendorNet.toFixed(2)} and earns the band their unit lands in, out of
            your ₹{(120 - vendorNet).toFixed(2)} margin — you keep whatever their wait did not earn.
          </p>
        </div>

        {/* Apply button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || isLocked}
          title={isLocked ? "Unlock to edit and apply the margin" : undefined}
          className="h-[42px] px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all active:scale-[0.98] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            <span>Apply to All Products</span>
          )}
        </button>
      </div>

      {/* ── Default margin bands ─────────────────────────────────────────
          What an investor earns, by how long their unit took to sell. These
          are the fallback for any product admin has not given its own rules,
          which is most of them. Saved separately from the margin above and
          deliberately harmless: bands never move a customer's price or a
          vendor's net, and an existing investment settles against the bands
          snapshotted when it was made — so this can only affect investments
          made from here on. */}
      <div className="mt-4 pt-3.5 border-t border-slate-200">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Default margin bands</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              What an investor earns, by how long their unit takes to sell. Used by any product
              without rules of its own — set those per product when you approve it. A faster sale
              earns less; a slower one earns more.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[11px] font-semibold text-slate-500">
            <span />
            <span className="w-20 sm:w-24 text-center">Sells within</span>
            <span className="w-20 sm:w-24 text-center">Earns</span>
          </div>

          {BAND_KEYS.map((key) => (
            <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <label className="text-sm text-slate-700">
                {BAND_LABEL[key]}
                {key === "high" && (
                  <span className="ml-1 text-[11px] text-slate-400">(and slower)</span>
                )}
              </label>

              <div className="relative w-20 sm:w-24">
                <input
                  type="number"
                  min={1}
                  value={bandForm[key].days}
                  onChange={(e) =>
                    setBandForm({ ...bandForm, [key]: { ...bandForm[key], days: e.target.value } })
                  }
                  aria-label={`${BAND_LABEL[key]} days`}
                  className="w-full pl-3 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  d
                </span>
              </div>

              <div className="relative w-20 sm:w-24">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={bandForm[key].pct}
                  onChange={(e) =>
                    setBandForm({ ...bandForm, [key]: { ...bandForm[key], pct: e.target.value } })
                  }
                  aria-label={`${BAND_LABEL[key]} percentage`}
                  className="w-full pl-3 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  %
                </span>
              </div>
            </div>
          ))}
        </div>

        {bandError ? (
          <p className="mt-2 text-xs font-medium text-red-600">{bandError}</p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            On a ₹120 listing an investor pays ₹{vendorNet.toFixed(2)} and gets back{" "}
            {BAND_KEYS.map((k, i) => (
              <span key={k}>
                {i > 0 ? " / " : ""}
                <strong>
                  ₹{(vendorNet * (1 + (Number(bandForm[k].pct) || 0) / 100)).toFixed(2)}
                </strong>
              </span>
            ))}{" "}
            — you keep the rest of the margin. Changing these never touches an existing investment.
          </p>
        )}

        <button
          type="button"
          onClick={handleSaveBands}
          disabled={bandsSaving || Boolean(bandError)}
          className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {bandsSaving ? "Saving..." : "Save Default Bands"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
        <span>
          <strong>Formula:</strong> vendor gets, and investor pays, listing price ÷ (1 + margin%).
          What the investor is PAID is that figure plus their band&apos;s %, decided by how long
          their own unit took to sell. Raising the margin refunds investors the difference and pays
          vendors less. GST is charged on top and changes nobody&apos;s cut.
        </span>
        {isLocked && (
          <span className="text-amber-700 font-medium">
            💡 Tip: Click &quot;Click to Unlock&quot; or click the input box to start editing.
          </span>
        )}
      </div>
    </div>
  );
}
