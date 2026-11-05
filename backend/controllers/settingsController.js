const PlatformSettings = require('../models/platformSettingsModel');
const Product = require('../models/productModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');
const { calculateGlobalPricing, resolveMarginPct } = require('../utils/pricingCalculator');
const { repriceInvestments } = require('../utils/repriceInvestments');
const {
    BAND_KEYS,
    bandsError,
    normaliseBands,
    resolveBands,
    forecastPayout,
    isCompleteBands,
} = require('../utils/marginBands');
const {
    returnPolicyError,
    resolveReturnPolicy,
    describeReturnPolicy,
} = require('../utils/returnPolicy');

const round2 = (n) => Number(n.toFixed(2));

/**
 * Recalculate every price on a set of products, and settle up with the
 * investors that affects.
 *
 * Inlined here when Phase 20 left it a single caller. It used to be
 * utils/repriceProducts.js, shared with two margin-category callers that no
 * longer exist: a band is not a margin any more, so nothing but the margin
 * itself can move these numbers.
 *
 * Why refunds happen at all: marginPct is carved out of the listing price, so
 * raising it makes `price / (1 + margin)` smaller — every investor holding an
 * unsold unit at the old, higher investorPrice is now over-invested and is owed
 * the difference. See utils/repriceInvestments.js.
 */
async function repriceAll(products, settings) {
    let updated = 0;
    let overridden = 0;
    let refundedCount = 0;

    for (const product of products) {
        const marginPct = resolveMarginPct(product, settings);
        if (product.marginPct != null) overridden++;

        const derived = calculateGlobalPricing(product.price, { marginPct });

        product.price = derived.price;
        product.vendorPrice = derived.vendorPrice;
        product.investorPrice = derived.investorPrice;
        // The forecast follows the new investor price. What anyone is actually
        // paid is decided at settlement from their own days held.
        product.investorPayout = forecastPayout(
            derived.investorPrice,
            resolveBands(product, settings),
            product.marginCategory
        );
        product.pricingStatus = 'priced';
        // listingStatus is deliberately NOT touched. An earlier version flipped
        // draft/pending_approval products to 'live', which meant changing a
        // margin silently published vendor listings nobody had reviewed.
        // Repricing is not an approval decision.
        await product.save({ validateBeforeSave: false });
        updated++;

        const refunds = await repriceInvestments(product);
        refundedCount += refunds.length;
    }

    return { updated, overridden, refundedCount };
}

// Get the current global margin ---ADMIN / VENDOR
//
// Vendors need `marginPct` to show their own net on the product form, so this
// is readable by them too. It is not public: the margin is the platform's cut
// and nobody shopping needs to see it.
exports.getPricingSettings = asyncErrorHandler(async (req, res, next) => {
    const settings = await PlatformSettings.getSingleton();

    res.status(200).json({
        success: true,
        settings,
    });
});

// Just the tax rate ---PUBLIC
//
// Every client shows a GST line before anyone signs in (the cart totals for a
// guest, the vendor form's customer-total preview), and a tax rate printed on
// every invoice is not a secret. `marginPct` is deliberately NOT returned
// here — see getPricingSettings.
exports.getPublicTaxSettings = asyncErrorHandler(async (req, res) => {
    const settings = await PlatformSettings.getSingleton();

    res.status(200).json({
        success: true,
        gstPct: settings.gstPct,
    });
});

// Update the global margin and recalculate every priced product ---ADMIN
//
// Customer-facing `price` never moves here — that's the vendor's listing
// price. What moves is everyone's cut of it: the vendor's net, what an
// investor pays, and what an investor is paid. Every priced product is
// recalculated, with no opt-out, because a product left on a stale margin
// would quietly pay its vendor the wrong amount (see productModel.js).
//
// Products carrying their own `marginPct` are recomputed against that instead,
// so changing the global rate leaves their numbers untouched.
//
// A lower margin means unmatched investors are now over-invested, so they get
// refunded the difference — see utils/repriceInvestments.js.
exports.updatePricingSettings = asyncErrorHandler(async (req, res, next) => {
    const { marginPct, gstPct } = req.body;

    if (marginPct === undefined || marginPct === null || Number.isNaN(Number(marginPct))) {
        return next(new ErrorHandler("Margin percentage is required", 400));
    }

    if (Number(marginPct) < 0) {
        return next(new ErrorHandler("Margin cannot be negative", 400));
    }

    // GST is optional on this call so an existing admin UI that only sends
    // marginPct keeps working rather than wiping the rate to undefined.
    if (gstPct !== undefined && gstPct !== null) {
        if (Number.isNaN(Number(gstPct))) {
            return next(new ErrorHandler("GST percentage must be a number", 400));
        }
        if (Number(gstPct) < 0 || Number(gstPct) > 100) {
            return next(new ErrorHandler("GST must be between 0 and 100", 400));
        }
    }

    const settings = await PlatformSettings.getSingleton();
    settings.marginPct = Number(marginPct);
    if (gstPct !== undefined && gstPct !== null) {
        // Deliberately no repricing below for this: GST is added on top of the
        // listing price and changes nobody's cut, so no product's vendorPrice,
        // investorPrice or payout moves when the rate changes.
        settings.gstPct = Number(gstPct);
    }
    settings.updatedAt = Date.now();
    await settings.save();

    // ponytail: sequential, and each owed refund is a Razorpay round-trip, so a
    // large catalogue can push this request past a gateway/proxy timeout. It is
    // safe to just call again: a refund already applied leaves the investment at
    // the new price, so the next pass computes nothing owed and skips it. Move
    // to a background job if the catalogue grows enough for that to be annoying.
    const products = await Product.find({ price: { $gt: 0 } });

    // Every product is visited, with no opt-out, because one left on a stale
    // margin would quietly pay its vendor the wrong amount.
    const { updated: updatedCount, overridden: overriddenCount, refundedCount } =
        await repriceAll(products, settings);

    // ── Phase 23: a band can never pay more than the margin it comes out of ──
    //
    // `bandsError` only ever ran when a band was SAVED, so lowering the global
    // margin afterwards left products carrying bands above it — drop 20% to 8%
    // and a slow sale pays the investor 15% out of an 8% margin, taking the
    // difference from the platform. `calculateUnitProfit` goes negative with
    // nothing refusing it.
    //
    // Clamped rather than rejected: refusing the save would block a legitimate
    // business decision over data admin cannot see from that screen. Existing
    // investments are untouched either way — each carries its own snapshot — so
    // this only binds investments made from now on.
    let clampedCount = 0;
    const clampedNames = [];

    for (const product of products) {
        if (!isCompleteBands(product.marginBands)) continue;

        const ceiling = resolveMarginPct(product, settings);
        let touched = false;

        for (const key of BAND_KEYS) {
            if (Number(product.marginBands[key].pct) > ceiling) {
                product.marginBands[key].pct = ceiling;
                touched = true;
            }
        }

        if (!touched) continue;

        // The forecast quoted on the listing follows the clamped bands, or the
        // product advertises a return its own rules would no longer pay.
        if (product.investorPrice != null) {
            product.investorPayout = forecastPayout(
                product.investorPrice,
                product.marginBands,
                product.marginCategory
            );
        }

        await product.save({ validateBeforeSave: false });
        clampedCount++;
        if (clampedNames.length < 5) clampedNames.push(product.name);
    }

    // The platform defaults need the same treatment — they are what every
    // product with no bands of its own falls back to.
    let defaultsClamped = false;
    if (isCompleteBands(settings.defaultMarginBands)) {
        for (const key of BAND_KEYS) {
            if (Number(settings.defaultMarginBands[key].pct) > settings.marginPct) {
                settings.defaultMarginBands[key].pct = settings.marginPct;
                defaultsClamped = true;
            }
        }
        if (defaultsClamped) await settings.save();
    }

    res.status(200).json({
        success: true,
        message: `Margin saved. ${updatedCount} product(s) repriced`
            + (overriddenCount > 0
                ? ` (${overriddenCount} kept their own margin override)` : '')
            + (refundedCount > 0 ? `, ${refundedCount} investment(s) refunded` : '')
            + (clampedCount > 0
                ? `. ${clampedCount} product(s) had margin bands above the new rate and were `
                  + `capped at it${clampedNames.length ? ` (${clampedNames.join(', ')}${clampedCount > clampedNames.length ? ', …' : ''})` : ''}`
                  // Said plainly, because the old percentages are overwritten
                  // and raising the margin back will NOT restore them.
                  + ' — raising the margin again will not restore the old percentages, '
                  + 'so re-enter them if you need them'
                : '')
            + (defaultsClamped ? '. The platform default bands were capped too' : '')
            + '.',
        settings,
        updatedCount,
        overriddenCount,
        refundedCount,
        clampedCount,
        clampedProducts: clampedNames,
        defaultsClamped,
    });
});

// Update the platform-default margin bands ---ADMIN
//
// The bands every product falls back to when admin sets none of its own, which
// is the normal case: the approval panel shows these numbers as the default and
// admin only overrides them for a product that needs different terms.
//
// Deliberately does NOT reprice anything. Bands do not touch the customer's
// price or the vendor's net, and an existing investment settles against the
// snapshot taken when it was made — so changing these can only affect
// investments made from now on. That is the whole reason the snapshot exists.
exports.updateDefaultMarginBands = asyncErrorHandler(async (req, res, next) => {
    const { defaultMarginBands } = req.body;

    if (!isCompleteBands(defaultMarginBands)) {
        return next(new ErrorHandler(
            "Set all three default margin bands (days and %, for low, medium and high)", 400
        ));
    }

    const settings = await PlatformSettings.getSingleton();

    // Capped at the global margin, since that is the pot a band is paid out of.
    // A product with its own higher marginPct can still carry higher bands of
    // its own — that is checked per product on save.
    const bandError = bandsError(defaultMarginBands, settings.marginPct);
    if (bandError) {
        return next(new ErrorHandler(bandError, 400));
    }

    settings.defaultMarginBands = normaliseBands(defaultMarginBands);
    settings.updatedAt = Date.now();
    await settings.save();

    // Products with no bands of their own now quote a different forecast. Only
    // the display figure moves — no money, and so no refunds.
    const products = await Product.find({ price: { $gt: 0 }, investorPrice: { $ne: null } });
    let requoted = 0;
    for (const product of products) {
        if (isCompleteBands(product.marginBands)) continue;
        const requote = forecastPayout(
            product.investorPrice,
            settings.defaultMarginBands,
            product.marginCategory
        );
        if (round2(product.investorPayout ?? NaN) === requote) continue;
        product.investorPayout = requote;
        await product.save({ validateBeforeSave: false });
        requoted++;
    }

    res.status(200).json({
        success: true,
        message: `Default margin bands saved.`
            + (requoted > 0 ? ` ${requoted} product(s) re-quoted.` : ''),
        settings,
        requoted,
    });
});

// The return rules every product falls back to ---ADMIN
//
// Phase 21. Admin's answer to "all products get 7 days unless I say otherwise",
// and the only place that default lives. Changing it moves nothing retroactive:
// a product's policy is resolved on read, and an ORDER snapshots the policy it
// was sold under, so neither an existing order's window nor an existing payout
// date can shift under anyone.
exports.updateDefaultReturnPolicy = asyncErrorHandler(async (req, res, next) => {
    const { defaultReturnPolicy, defaultReturnWindowDays } = req.body;

    if (defaultReturnPolicy === undefined && defaultReturnWindowDays === undefined) {
        return next(new ErrorHandler("Nothing to update", 400));
    }

    const settings = await PlatformSettings.getSingleton();

    // Validated as the pair that ends up stored, so 'none' arriving next to an
    // existing 7-day window is caught rather than silently contradicting.
    const error = returnPolicyError({
        returnPolicy: defaultReturnPolicy !== undefined
            ? defaultReturnPolicy : settings.defaultReturnPolicy,
        returnWindowDays: defaultReturnWindowDays !== undefined
            ? defaultReturnWindowDays : settings.defaultReturnWindowDays,
    });
    if (error) {
        return next(new ErrorHandler(error, 400));
    }

    if (defaultReturnPolicy !== undefined) {
        settings.defaultReturnPolicy = defaultReturnPolicy;
    }
    if (defaultReturnWindowDays !== undefined) {
        settings.defaultReturnWindowDays = Number(defaultReturnWindowDays);
    }
    // A default that cannot refund has no window, same normalisation products get.
    if (settings.defaultReturnPolicy !== 'full') {
        settings.defaultReturnWindowDays = 0;
    }

    settings.updatedAt = Date.now();
    await settings.save();

    const resolved = resolveReturnPolicy({}, settings);

    res.status(200).json({
        success: true,
        message: `Default return policy saved — ${describeReturnPolicy(resolved)}. `
            + 'Products with their own policy are unaffected, and no existing order changes.',
        settings,
    });
});
