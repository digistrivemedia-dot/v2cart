const mongoose = require('mongoose');

// One investment funds exactly one physical unit of a product's stock
// (per-unit FIFO model — see MARKETPLACE_CONVERSION_PLAN.md). `status`
// tracks whether this unit has been matched to a customer sale yet.
const investmentSchema = new mongoose.Schema({
    investor: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true
    },
    product: {
        type: mongoose.Schema.ObjectId,
        ref: "Product",
        required: true
    },
    // product.investorPrice as of invest time. Rewritten downward (with the
    // difference refunded) if the vendor drops the price before this unit
    // sells — see utils/repriceInvestments.js. A price rise never touches it.
    amountInvested: {
        type: Number,
        required: true,
        min: [0, "Amount invested cannot be negative"]
    },
    // What this unit is forecast to pay out, under the product's band at invest
    // time. A FORECAST since Phase 20 — the figure actually paid depends on how
    // long this unit took to sell (see marginBands below and payoutPaid).
    //
    // Still a contract for investments made BEFORE Phase 20, when the deal was
    // the full listing price: those have no `marginBands` snapshot, and
    // settlePayout() pays them exactly this.
    expectedPayout: {
        type: Number,
        required: true,
        min: [0, "Expected payout cannot be negative"]
    },
    // Phase 20 — the product's margin bands, snapshotted the moment this
    // investment was made. Two things depend on it being a copy:
    //
    //   1. Admin editing the product's bands later cannot change what an
    //      existing investor is owed. They bought a specific deal.
    //   2. Null means "made before Phase 20", i.e. the full-listing-price deal
    //      above. That is the entire grandfathering mechanism — there is no
    //      migration script, because the absence of this field IS the flag.
    marginBands: {
        low: {
            days: { type: Number, default: null },
            pct: { type: Number, default: null },
        },
        medium: {
            days: { type: Number, default: null },
            pct: { type: Number, default: null },
        },
        high: {
            days: { type: Number, default: null },
            pct: { type: Number, default: null },
        },
    },
    // Filled at settlement: the band percentage this unit's wait earned, and
    // the rupees paid. Stored rather than re-derived so the earnings pages and
    // any later audit read one row instead of re-running a money rule against
    // dates — and so the figure survives a later edit to anything upstream.
    payoutPct: {
        type: Number,
        default: null
    },
    payoutPaid: {
        type: Number,
        default: null
    },
    // Set when a price-drop refund was owed but the Razorpay call failed (or
    // there was no payment to refund against). The offsetting ledger row is
    // written regardless, so this flags money the platform still owes.
    refundFailed: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['unmatched', 'matched'],
        default: 'unmatched'
    },
    matchedOrder: {
        type: mongoose.Schema.ObjectId,
        ref: "Order",
        default: null
    },
    matchedAt: {
        type: Date,
        default: null
    },
    // Razorpay payment id that funded this investment. One payment now backs
    // one Investment doc per unit purchased (batch invest), so this is no
    // longer unique — the controller checks for reuse via a query instead.
    paymentId: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// FIFO lookups: "oldest unmatched investment for this product".
investmentSchema.index({ product: 1, status: 1, createdAt: 1 });
investmentSchema.index({ paymentId: 1 }, { sparse: true });

module.exports = mongoose.model("Investment", investmentSchema);
