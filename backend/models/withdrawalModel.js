const mongoose = require('mongoose');

/**
 * One request to take money out of an investor's wallet.
 *
 * The money leaves the wallet buckets the moment a request is created — held
 * in `wallet.pendingWithdrawal` rather than left spendable — so the same
 * balance can't be withdrawn twice or spent on units while a payout is in
 * flight. A failure returns it; nothing is ever "maybe deducted".
 *
 * `fromEarnings` / `fromCapital` record which buckets funded it, so a release
 * puts the money back exactly where it came from instead of all into one.
 */
const withdrawalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: [1, "A withdrawal must be at least ₹1"],
    },
    /** Earnings is drawn down first, so capital stays available to invest. */
    fromEarnings: { type: Number, default: 0 },
    fromCapital: { type: Number, default: 0 },

    status: {
        type: String,
        enum: [
            'processing', // payout created at RazorpayX, not settled yet
            'paid',       // money reached the investor
            'failed',     // rejected/reversed — the hold has been released
        ],
        default: 'processing',
        index: true,
    },

    /* ── RazorpayX refs, kept for support and reconciliation ── */
    payoutId: { type: String, default: null, index: true },
    /** Bank reference an investor can quote to their bank. */
    utr: { type: String, default: null },
    mode: { type: String, default: null },
    /** Snapshot of where it was sent, so later profile edits don't rewrite history. */
    destination: {
        type: { type: String, default: null },   // 'vpa' | 'bank_account'
        upiId: { type: String, default: null },
        accountLast4: { type: String, default: null },
        ifsc: { type: String, default: null },
    },
    failureReason: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
    settledAt: { type: Date, default: null },
});

withdrawalSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
