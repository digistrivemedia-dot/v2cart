/**
 * Pricing formulas, mirroring backend/utils/pricingCalculator.js.
 *
 * Two runtimes can't share one module, so this is a deliberate duplicate of
 * the backend's formulas — and the backend stays authoritative: it recomputes
 * every derived price on save, so anything here is for display and for the
 * one conversion the vendor form performs before submitting.
 *
 * If you change a formula here, change it there, and run
 * `node utils/pricingCalculator.js` to re-check the worked examples.
 *
 * ── The model ──────────────────────────────────────────────────────────────
 *
 * The margin is carved OUT OF the listing price, not added to a cost:
 *
 *   f              = 1 + marginPct/100
 *   price          = P        what the customer is charged, before GST
 *   vendorPrice    = P / f    what the vendor receives
 *   investorPrice  = P / f    what an investor pays
 *   investorPayout = P        what the investor receives when their unit sells
 *
 * GST is different: it is added ON TOP of P, and none of it belongs to the
 * platform, the vendor or the investor.
 */

export const round2 = (n: number): number => Number(n.toFixed(2));

export type MarginSettings = { marginPct: number };
export type TaxSettings = { gstPct: number };

/** What the vendor receives out of a listing price. */
export const vendorNetFromListing = (listingPrice: number, { marginPct }: MarginSettings): number =>
  round2(Number(listingPrice) / (1 + marginPct / 100));

/**
 * The inverse: what to list at so the vendor nets a given amount.
 *
 * This is the conversion the vendor product form performs — the vendor types
 * their own price and the form submits the listing price.
 */
export const listingFromVendorNet = (vendorNet: number, { marginPct }: MarginSettings): number =>
  round2(Number(vendorNet) * (1 + marginPct / 100));

/** The platform's cut of one unit at a given listing price. */
export const platformFee = (listingPrice: number, settings: MarginSettings): number =>
  round2(Number(listingPrice) - vendorNetFromListing(listingPrice, settings));

/** GST on top, and the total the customer actually pays. */
export function customerTotal(listingPrice: number, { gstPct }: TaxSettings) {
  const price = round2(Number(listingPrice));
  const gst = round2(price * (gstPct / 100));
  return { price, gst, total: round2(price + gst) };
}

/**
 * Everything the vendor form needs to show, from the one number they typed.
 *
 * Kept as a single function so the panel can't show a set of numbers that
 * don't add up: every figure below is derived from `vendorNet` and the two
 * admin-set rates, in one place.
 */
export function vendorPriceBreakdown(
  vendorNet: number,
  { marginPct, gstPct }: MarginSettings & TaxSettings
) {
  const net = Number(vendorNet) || 0;
  const listing = listingFromVendorNet(net, { marginPct });
  const { gst, total } = customerTotal(listing, { gstPct });

  return {
    /** What the vendor typed, and what they will be paid per unit sold. */
    vendorReceives: round2(net),
    /** The platform's cut — the difference between the two. */
    platformFee: round2(listing - net),
    marginPct,
    /** The customer-facing price, before tax. This is what gets stored. */
    listingPrice: listing,
    gstPct,
    gstAmount: gst,
    /** What the customer is charged at checkout. */
    customerTotal: total,
  };
}
