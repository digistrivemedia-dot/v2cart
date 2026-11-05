const mongoose = require('mongoose');

// Singleton document — always exactly one row. Holds the single global margin
// percentage admin sets once instead of pricing every product by hand.
// See MARKETPLACE_CONVERSION_PLAN.md Phase 10 for the formula:
//   price          = listingPrice                        (customer pays this)
//   vendorPrice    = listingPrice / (1 + marginPct/100)   (vendor receives this)
//   investorPrice  = same as vendorPrice                  (investor pays this)
//   investorPayout = listingPrice                         (investor receives this)
const platformSettingsSchema = new mongoose.Schema({
    // Platform's cut, expressed as a markup on what the vendor nets — so at
    // 20% a ₹120 listing pays the vendor ₹100 and the platform ₹20, and an
    // investor funding that unit turns ₹100 into ₹120.
    marginPct: {
        type: Number,
        default: 0,
        min: [0, "Margin cannot be negative"],
    },
    // GST charged on top of the listing price at checkout. Unlike marginPct
    // this is NOT carved out of the price — the customer pays price + GST, and
    // none of it belongs to the platform, the vendor or the investor.
    //
    // It used to be a hardcoded 0.18 in the web cart, the mobile cart and the
    // checkout form independently, which is three places to miss when the rate
    // changes. Everything derives it from here now.
    gstPct: {
        type: Number,
        default: 18,
        min: [0, "GST cannot be negative"],
        max: [100, "GST cannot exceed 100%"],
    },
    // Phase 20 — the margin bands a product uses when admin sets none of its
    // own. Each band is "sells within `days` -> the investor earns `pct`".
    //
    // This is NOT a second margin. The investor's return is paid OUT OF
    // marginPct above: at a 20% margin and a 5% band the customer still pays
    // 120, the vendor still nets 100, the investor turns 100 into 105 and the
    // platform keeps 15. See utils/marginBands.js, which owns every rule about
    // these numbers (ordering, the margin ceiling, which band a wait falls in).
    //
    // `high` is the SLOWEST, best-paying band — the name tracks the percentage,
    // not the speed.
    defaultMarginBands: {
        low: {
            days: { type: Number, default: 10, min: 1 },
            pct: { type: Number, default: 5, min: 0, max: 100 },
        },
        medium: {
            days: { type: Number, default: 15, min: 1 },
            pct: { type: Number, default: 10, min: 0, max: 100 },
        },
        high: {
            days: { type: Number, default: 90, min: 1 },
            pct: { type: Number, default: 15, min: 0, max: 100 },
        },
    },
    // Phase 23 — shipping, moved server-side.
    //
    // These were hardcoded in the web checkout, the mobile checkout and the
    // mobile pricing util independently. The server now computes the order
    // total it verifies a payment against, so it has to be the authority on
    // shipping too or the two totals disagree and every order is refused.
    shippingFee: {
        type: Number,
        default: 200,
        min: [0, "Shipping cannot be negative"],
    },
    freeShippingAbove: {
        type: Number,
        default: 5000,
        min: [0, "Free-shipping threshold cannot be negative"],
    },
    // Phase 21 — the return rules a product uses when admin sets none of its
    // own, and the reason settlement is no longer instant: nobody is paid until
    // the customer's right to send the product back has expired.
    //
    // Only a `full` policy holds money. A replacement costs the vendor a
    // physical unit, not the investor their payout and not the platform any
    // cash, so `replacement_only` and `none` settle at delivery. Every rule
    // about these two fields lives in utils/returnPolicy.js.
    defaultReturnPolicy: {
        type: String,
        enum: ['full', 'replacement_only', 'none'],
        default: 'full',
    },
    defaultReturnWindowDays: {
        type: Number,
        default: 7,
        min: [0, "A return window cannot be negative"],
        max: [180, "A return window that long holds the vendor's money too long"],
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

platformSettingsSchema.statics.getSingleton = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
