"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { HiCurrencyRupee } from "react-icons/hi";
import { FiLock, FiUnlock } from "react-icons/fi";
import {
  usePricingSettings,
  useUpdatePricingSettings,
} from "@/hooks/admin";
import { vendorNetFromListing, customerTotal } from "@/lib/pricing";

export function GlobalPricingBar() {
  const { settings, isLoading } = usePricingSettings();
  const { updateSettings, isPending } = useUpdatePricingSettings();

  const [marginPct, setMarginPct] = useState("");
  const [gstPct, setGstPct] = useState("");
  const [isLocked, setIsLocked] = useState(true);

  const hasSyncedRef = useRef(false);
  const marginInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && settings) {
      if (!hasSyncedRef.current || isLocked) {
        setMarginPct(settings.marginPct !== undefined ? settings.marginPct.toString() : "0");
        setGstPct(settings.gstPct !== undefined ? settings.gstPct.toString() : "0");
        hasSyncedRef.current = true;
      }
    }
  }, [isLoading, settings, isLocked]);

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

  const pct = Number(marginPct) || 0;
  const gst = Number(gstPct) || 0;
  const vendorNet = vendorNetFromListing(120, { marginPct: pct });
  const example = customerTotal(120, { gstPct: gst });

  const handleSave = () => {
    if (isLocked) return;

    if (pct > settings.marginPct) {
      const ok = window.confirm(
        `Raising the margin from ${settings.marginPct}% to ${pct}% will:\n\n`
          + `• reduce what every vendor receives per sale\n\n`
          + `Customer prices do not change. This cannot be undone. Continue?`
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
              Margin is your cut of every vendor&apos;s listing price. GST is added on top at checkout.
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

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            On a ₹120 listing
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            Vendor gets <strong>₹{vendorNet.toFixed(2)}</strong> · you keep{" "}
            <strong>₹{(120 - vendorNet).toFixed(2)}</strong> · customer pays{" "}
            <strong>₹{example.total.toFixed(2)}</strong> (₹120 + ₹{example.gst.toFixed(2)} GST)
          </p>
        </div>

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

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
        <span>
          <strong>Formula:</strong> vendor gets listing price ÷ (1 + margin%). GST is charged on top and does not affect the vendor&apos;s cut.
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
