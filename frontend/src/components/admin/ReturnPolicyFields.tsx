"use client";

/**
 * The return-policy editor — MARKETPLACE_CONVERSION_PLAN.md Phase 21.
 *
 * Shared by the approval flow and the pricing panel for an already-live
 * product, because admin can set these at either moment and two copies would
 * drift. It owns the form state shape (`ReturnPolicyForm`, all strings, as a
 * form always is) and the conversion back to the API's tri-state.
 *
 * What admin is actually choosing here is how long the platform holds the
 * vendor's and the investor's money, so the panel says that in those words
 * rather than calling it a "policy" and leaving them to infer it.
 */

import { FiClock, FiRefreshCw, FiSlash } from "react-icons/fi";

export const RETURN_POLICIES = ["full", "replacement_only", "none"] as const;
export type ReturnPolicyKey = (typeof RETURN_POLICIES)[number];

export type ReturnPolicyForm = {
  policy: ReturnPolicyKey;
  windowDays: string;
};

export const POLICY_META: Record<
  ReturnPolicyKey,
  {
    label: string;
    blurb: string;
    icon: typeof FiClock;
    /** Whether a sale under this policy holds the vendor's money. */
    holdsMoney: boolean;
    /** Whether the customer gets days to act (independent of the money). */
    takesWindow: boolean;
  }
> = {
  full: {
    label: "Refund or replacement",
    blurb: "Money is held until the window closes",
    icon: FiClock,
    holdsMoney: true,
    takesWindow: true,
  },
  replacement_only: {
    label: "Replacement only",
    blurb: "Paid at delivery — a swap costs the vendor a unit, not cash",
    icon: FiRefreshCw,
    holdsMoney: false,
    // Phase 22 — it still needs a window: that is how long the customer has
    // to report a dead unit. Zeroing it made these un-swappable the moment
    // they were delivered, which defeated the policy entirely.
    takesWindow: true,
  },
  none: {
    label: "No return",
    blurb: "Paid at delivery — for sealed goods like RAM or memory cards",
    icon: FiSlash,
    holdsMoney: false,
    // Nothing can ever be asked for, so days to ask within are meaningless.
    takesWindow: false,
  },
};

/** The default every product falls back to, for the "using the default" hint. */
export type ReturnDefaults = { policy: ReturnPolicyKey; windowDays: number };

export const toReturnPolicyForm = (
  product: any,
  defaults: ReturnDefaults
): ReturnPolicyForm => ({
  policy: (product?.returnPolicy as ReturnPolicyKey) || defaults.policy,
  windowDays:
    product?.returnWindowDays != null
      ? String(product.returnWindowDays)
      : String(defaults.windowDays),
});

/**
 * Mirrors returnPolicyError in backend/utils/returnPolicy.js. Duplicated only
 * so a typo is caught before a round-trip — the backend check is the authority
 * and runs regardless.
 */
export function returnPolicyFormError(form: ReturnPolicyForm): string | null {
  if (!POLICY_META[form.policy].takesWindow) return null;

  const raw = form.windowDays.trim();
  if (raw === "") return "Enter how many days the customer has to return it";

  const days = Number(raw);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 0) {
    return "The return window must be a whole number of days, 0 or more";
  }
  if (days > 180) {
    return "A window longer than 180 days holds the vendor's money for too long — check it is days, not a date";
  }
  return null;
}

/** Form state -> the two API fields. A non-full policy always sends 0 days. */
export function returnPolicyPayload(form: ReturnPolicyForm) {
  return {
    returnPolicy: form.policy,
    returnWindowDays: POLICY_META[form.policy].takesWindow
      ? Number(form.windowDays || 0)
      : 0,
  };
}

interface Props {
  value: ReturnPolicyForm;
  onChange: (next: ReturnPolicyForm) => void;
  defaults: ReturnDefaults;
  /** True when the product has no policy of its own and is on the default. */
  usingDefault?: boolean;
  disabled?: boolean;
}

export function ReturnPolicyFields({
  value,
  onChange,
  defaults,
  usingDefault,
  disabled,
}: Props) {
  const error = returnPolicyFormError(value);
  const holds = POLICY_META[value.policy].holdsMoney;
  const takesWindow = POLICY_META[value.policy].takesWindow;

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Return window
        </h4>
        {usingDefault && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            using the platform default
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        This decides when the vendor and the investor are paid. Nobody is paid
        while a customer can still send the product back.
      </p>

      <div className="space-y-2">
        {RETURN_POLICIES.map((key) => {
          const meta = POLICY_META[key];
          const Icon = meta.icon;
          const selected = value.policy === key;

          return (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                selected
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="returnPolicy"
                className="mt-1"
                checked={selected}
                disabled={disabled}
                onChange={() => onChange({ ...value, policy: key })}
              />
              <Icon
                className={`mt-0.5 shrink-0 ${
                  selected ? "text-blue-600" : "text-slate-400"
                }`}
                size={16}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  {meta.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {meta.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/* Shown whenever the customer gets days to act — which includes
          replacement-only, even though its money is paid at delivery. The two
          are separate questions; see POLICY_META.takesWindow. */}
      {takesWindow && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            {holds ? "Days to return" : "Days to report a fault"}
          </label>
          <input
            type="number"
            min={0}
            max={180}
            step={1}
            value={value.windowDays}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, windowDays: e.target.value })}
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            default is {defaults.windowDays}
          </span>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        {holds ? (
          <>
            Sold units are paid out{" "}
            <strong>
              {Number(value.windowDays || 0)} day
              {Number(value.windowDays || 0) === 1 ? "" : "s"}
            </strong>{" "}
            after delivery. A return inside that window refunds the customer and
            puts the investor&apos;s unit back in the pool to sell again.
          </>
        ) : takesWindow ? (
          <>
            Sold units are paid out <strong>at delivery</strong> — there is no
            refund to protect. The customer still has{" "}
            <strong>
              {Number(value.windowDays || 0)} day
              {Number(value.windowDays || 0) === 1 ? "" : "s"}
            </strong>{" "}
            to report a faulty unit and ask for a replacement.
          </>
        ) : (
          <>
            Sold units are paid out <strong>at delivery</strong>, and the
            customer cannot return or replace this item.
          </>
        )}
      </p>

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
