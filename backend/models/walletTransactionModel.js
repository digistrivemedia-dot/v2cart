const mongoose = require('mongoose');

/**
 * Append-only cash ledger for investor wallets.
 *
 * One row per movement of money into or out of a bucket. Rows are never
 * mutated or deleted; a reversal inserts an offsetting row.
 *
 * ── Why this is separate from `Transaction` ────────────────────────────────
 *
 * `Transaction` is the BUSINESS ledger: it records that an investor earned a
 * ₹120 payout on a unit, which is what the earnings dashboards aggregate. It
 * says nothing about where cash sits.
 *
 * This is the CASH ledger: the same sale writes two rows here — ₹100 back to
 * capital and ₹20 into earnings — because that is what actually moved. One
 * business event, two cash movements, two different questions. Collapsing
 * them into one collection would mean either breaking the existing dashboard
 * aggregates or losing the bucket split.
 *
 * `balanceAfter` is denormalised onto every row so a statement can show a
 * running balance without re-summing, and so a reconciliation failure points
 * at the exact row where the two diverged.
 */
const walletTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    // Which balance moved. A sale touches both, as two rows.
    bucket: {
        type: String,
        enum: ['capital', 'earnings'],
        required: true,
    },
    type: {
        type: String,
        enum: [
            'topup',              // investor added money (Razorpay in)
            'investment',         // capital deployed on units
            'principal_returned', // a funded unit sold; its principal came back
            'profit',             // the margin earned on that unit
            'refund',             // price drop handed capital back
            'withdrawal_hold',    // reserved for a withdrawal request
            'withdrawal_paid',    // payout succeeded; the hold is consumed
            'withdrawal_released',// request rejected/failed; hold returned
            'profit_reversal',    // order cancelled; profit clawed back
            'principal_reversal', // order cancelled; principal re-deployed
            // Phase 23 — a vendor's share of a matured sale. Their own
            // earnings rail, so the same wallet and the same withdrawal flow
            // serve both roles rather than a second parallel implementation.
            'vendor_sale',
            'vendor_sale_reversal',
            'opening_balance',    // money earned before the wallet existed (backfill)
            'adjustment',         // manual correction by an admin
        ],
        required: true,
    },
    // Positive = money into the bucket, negative = out of it.
    amount: {
        type: Number,
        required: true,
    },
    /** The bucket's balance immediately after this row was applied. */
    balanceAfter: {
        type: Number,
        required: true,
    },
    investment: { type: mongoose.Schema.ObjectId, ref: "Investment", default: null },
    /**
     * How many units this row covers.
     *
     * 1 for a per-unit movement (a sale returns one unit's principal), N for a
     * batch (funding 3 units of one product is one debit of 3). Stored rather
     * than parsed back out of `note`, so the statement can say
     * "test product six × 2" without guessing.
     */
    quantity: { type: Number, default: null },
    product: { type: mongoose.Schema.ObjectId, ref: "Product", default: null },
    order: { type: mongoose.Schema.ObjectId, ref: "Order", default: null },
    withdrawal: { type: mongoose.Schema.ObjectId, ref: "Withdrawal", default: null },
    /** Razorpay payment id for a top-up; free-form context otherwise. */
    reference: { type: String, default: null },
    note: { type: String, default: null },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ user: 1, bucket: 1 });
// A Razorpay payment must never be able to fund two top-ups.
//
// `sparse` is deliberately NOT set: MongoDB rejects it alongside
// partialFilterExpression, and the whole index then fails to build — silently,
// because Mongoose logs the error without crashing. That is exactly what
// happened the first time, and replay protection simply did not exist until a
// probe credited the same payment twice. The partial filter alone does the
// job: it indexes only topup rows that actually carry a reference, so the
// thousands of rows with a null reference never collide.
walletTransactionSchema.index(
    { type: 1, reference: 1 },
    {
        unique: true,
        partialFilterExpression: {
            type: 'topup',
            reference: { $type: 'string' },
        },
    }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
