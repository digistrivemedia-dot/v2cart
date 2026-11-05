const mongoose = require('mongoose');

/**
 * An investor's wallet — the only rail their money travels on.
 *
 * ── Why two balances ───────────────────────────────────────────────────────
 *
 * `capital` is money that can be deployed: top-ups land here, funding a unit
 * debits it, and a unit's principal returns here when it sells (as does the
 * part of it handed back by a price-drop refund).
 *
 * `earnings` is pure profit: when a funded unit sells, the margin above the
 * principal credits here and nothing else does.
 *
 * Both are withdrawable, and `withdrawable` is their sum. The split exists so
 * an investor can see what they have actually *made* without subtracting
 * their own capital out of a single blended number.
 *
 * ── Why a separate collection ──────────────────────────────────────────────
 *
 * Not fields on User, because every movement is an atomic conditional update
 * (`$gte` guard + `$inc` in one findOneAndUpdate) and that guard must not
 * contend with ordinary profile writes. One document per user.
 *
 * ── Why a stored balance at all ────────────────────────────────────────────
 *
 * It could be summed from walletTransactions on every read. A stored balance
 * is kept instead because the guard above is what makes a double-spend
 * impossible: read-then-write cannot be made safe without it. The ledger
 * remains the audit trail, and `scripts/wallet.check.js` asserts the two
 * agree — run it after anything that touches money.
 */
const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    // Deployable: top-ups, returned principal, price-drop refunds.
    capital: {
        type: Number,
        default: 0,
        min: [0, "Wallet capital cannot go negative"],
    },
    // Profit only.
    earnings: {
        type: Number,
        default: 0,
        min: [0, "Wallet earnings cannot go negative"],
    },
    // Reserved by a pending withdrawal: already debited from the buckets, not
    // yet paid out. Kept visible so "where did my money go" has an answer
    // while a payout is in flight.
    pendingWithdrawal: {
        type: Number,
        default: 0,
        min: [0, "Pending withdrawal cannot go negative"],
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

walletSchema.virtual('withdrawable').get(function () {
    return Number((this.capital + this.earnings).toFixed(2));
});

walletSchema.set('toJSON', { virtuals: true });
walletSchema.set('toObject', { virtuals: true });

/** Every investor has a wallet the first time anything asks for one. */
walletSchema.statics.forUser = async function (userId, session = null) {
    const existing = await this.findOne({ user: userId }).session(session);
    if (existing) return existing;

    // upsert rather than create: two concurrent first-touches must not race
    // into a duplicate-key error.
    return this.findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId, capital: 0, earnings: 0, pendingWithdrawal: 0 } },
        { upsert: true, new: true, session }
    );
};

module.exports = mongoose.model("Wallet", walletSchema);
