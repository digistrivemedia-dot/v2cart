const mongoose = require('mongoose');
const Wallet = require('../models/walletModel');
const WalletTransaction = require('../models/walletTransactionModel');

/**
 * The only place investor money moves.
 *
 * Every caller goes through `applyMovements`, which does two things together
 * or neither: adjust the stored balance and write the ledger row that
 * explains it. Nothing in the codebase should ever `$inc` a wallet directly —
 * a balance without a matching ledger row is money the audit can't explain,
 * and `scripts/wallet.check.js` will fail on it.
 *
 * ── How a double-spend is prevented ────────────────────────────────────────
 *
 * Not by reading the balance and then writing it: two concurrent investments
 * would both read ₹100, both pass, and both spend it. Instead a debit is a
 * single conditional update —
 *
 *     findOneAndUpdate({ user, capital: { $gte: 100 } }, { $inc: { capital: -100 } })
 *
 * — so the guard and the deduction are one atomic operation. If it matches
 * nothing, the balance was insufficient at the moment of writing and the
 * whole transaction aborts.
 *
 * Multi-row movements (a sale credits capital AND earnings) run inside a
 * Mongo transaction, so a crash between them can't leave half a settlement.
 */

const round2 = (n) => Number(Number(n).toFixed(2));

/** Thrown when a debit would take a bucket below zero. */
class InsufficientFunds extends Error {
    constructor(bucket, requested, available) {
        super(
            `Insufficient ${bucket}: ₹${round2(requested)} requested, ₹${round2(available)} available`
        );
        this.name = 'InsufficientFunds';
        this.statusCode = 400;
        this.bucket = bucket;
        this.requested = round2(requested);
        this.available = round2(available);
    }
}

const BUCKETS = ['capital', 'earnings'];

/**
 * Apply one or more movements atomically.
 *
 * @param {string} userId
 * @param {Array} movements  `{ bucket, type, amount, ...refs }`; amount signed
 * @param {object} [options]
 * @param {import('mongoose').ClientSession} [options.session]  join a caller's transaction
 * @returns {Promise<{ wallet: object, rows: object[] }>}
 *
 * A zero-amount movement is dropped rather than written — the ledger should
 * not fill up with rows that moved nothing (a ₹0 profit on a zero-margin
 * product, for instance).
 */
async function applyMovements(userId, movements, { session: outerSession } = {}) {
    const real = movements
        .map((m) => ({ ...m, amount: round2(m.amount) }))
        .filter((m) => m.amount !== 0);

    if (real.length === 0) {
        const wallet = await Wallet.forUser(userId, outerSession);
        return { wallet, rows: [] };
    }

    for (const m of real) {
        if (!BUCKETS.includes(m.bucket)) {
            throw new Error(`Unknown wallet bucket: ${m.bucket}`);
        }
    }

    const run = async (session) => {
        // Ensures the document exists before any conditional update targets it.
        await Wallet.forUser(userId, session);

        const rows = [];
        let wallet;

        for (const movement of real) {
            const { bucket, amount } = movement;

            if (amount < 0) {
                // The guard and the deduction in one operation — see the note
                // at the top of this file.
                wallet = await Wallet.findOneAndUpdate(
                    { user: userId, [bucket]: { $gte: -amount } },
                    { $inc: { [bucket]: amount }, $set: { updatedAt: new Date() } },
                    { new: true, session }
                );

                if (!wallet) {
                    const current = await Wallet.findOne({ user: userId }).session(session);
                    throw new InsufficientFunds(bucket, -amount, current?.[bucket] ?? 0);
                }
            } else {
                wallet = await Wallet.findOneAndUpdate(
                    { user: userId },
                    { $inc: { [bucket]: amount }, $set: { updatedAt: new Date() } },
                    { new: true, session }
                );
            }

            const [row] = await WalletTransaction.create(
                [
                    {
                        user: userId,
                        bucket,
                        type: movement.type,
                        amount,
                        // Denormalised so a statement needs no running sum and a
                        // reconciliation failure names the row it broke at.
                        balanceAfter: round2(wallet[bucket]),
                        investment: movement.investment ?? null,
                        product: movement.product ?? null,
                        quantity: movement.quantity ?? null,
                        order: movement.order ?? null,
                        withdrawal: movement.withdrawal ?? null,
                        reference: movement.reference ?? null,
                        note: movement.note ?? null,
                    },
                ],
                { session }
            );

            rows.push(row);
        }

        return { wallet, rows };
    };

    // Join the caller's transaction when there is one, so a wallet movement
    // can be part of a larger all-or-nothing operation (order settlement
    // touches several investors).
    if (outerSession) return run(outerSession);

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await run(session);
        });
        return result;
    } finally {
        await session.endSession();
    }
}

/* ------------------------------ read helpers ------------------------------ */

async function getWallet(userId) {
    const wallet = await Wallet.forUser(userId);
    return wallet;
}

/** What this investor could withdraw right now. */
async function withdrawableOf(userId) {
    const wallet = await Wallet.forUser(userId);
    return round2(wallet.capital + wallet.earnings);
}

/* ---------------------------- named operations ---------------------------- */
//
// Thin wrappers so call sites read as intent rather than as bucket arithmetic,
// and so the bucket a given event touches is decided here, once.

/**
 * Money in from Razorpay. `reference` is the gateway payment id.
 *
 * A payment can fund exactly one top-up. There are two defences, on purpose:
 * the unique partial index on (type, reference) is the race guard, and this
 * explicit check gives a clean error and keeps working even if that index is
 * missing from a given environment. The index having silently failed to build
 * once is precisely why the check is here too.
 */
async function creditTopup(userId, amount, reference, opts) {
    if (!reference) {
        throw new Error('A top-up needs the gateway payment id as its reference');
    }

    const already = await WalletTransaction.findOne({ type: 'topup', reference });
    if (already) {
        const err = new Error('This payment has already been credited');
        err.code = 11000;
        throw err;
    }

    return applyMovements(
        userId,
        [{ bucket: 'capital', type: 'topup', amount, reference }],
        opts
    );
}

/**
 * Deploying capital onto units. Fails if capital is short.
 *
 * `lines` is one entry per product — `{ product, quantity, amount }` — so the
 * statement can show what was funded and how many, rather than a single lump
 * debit nobody can attribute. The whole batch still moves atomically.
 */
const debitInvestment = (userId, lines, opts) =>
    applyMovements(
        userId,
        lines.map((line) => ({
            bucket: 'capital',
            type: 'investment',
            amount: -line.amount,
            product: line.product,
            quantity: line.quantity,
        })),
        opts
    );

/** A price drop handing part of the principal back. */
const creditRefund = (userId, amount, refs = {}, opts) =>
    applyMovements(userId, [{ bucket: 'capital', type: 'refund', amount, quantity: 1, ...refs }], opts);

/**
 * A funded unit sold.
 *
 * The principal returns to capital and only the margin above it lands in
 * earnings — so "what have I made" is the earnings figure and nothing else.
 */
const creditSale = (userId, { principal, payout }, refs = {}, opts) =>
    applyMovements(
        userId,
        [
            { bucket: 'capital', type: 'principal_returned', amount: principal, quantity: 1, ...refs },
            { bucket: 'earnings', type: 'profit', amount: round2(payout - principal), quantity: 1, ...refs },
        ],
        opts
    );

/**
 * The order that matched a unit was cancelled.
 *
 * The exact inverse of `creditSale`: the profit is clawed back out of earnings
 * and the principal leaves capital, because that unit is re-pooled and the
 * capital is deployed again rather than spendable.
 */
const reverseSale = (userId, { principal, payout }, refs = {}, opts) =>
    applyMovements(
        userId,
        [
            { bucket: 'earnings', type: 'profit_reversal', amount: -round2(payout - principal), quantity: 1, ...refs },
            { bucket: 'capital', type: 'principal_reversal', amount: -principal, quantity: 1, ...refs },
        ],
        opts
    );

/**
 * A vendor's cut of a matured sale.
 *
 * Phase 23. `vendor_earning` rows have always been written to the business
 * ledger, but there was no vendor wallet and no payout — the rows were
 * reporting only, and every vendor was paid by manual bank transfer with
 * nothing recording what had been settled.
 *
 * Credited to `earnings` rather than `capital` because a vendor never deploys
 * capital: there is nothing for them to invest in. `withdrawableOf` is the sum
 * of both buckets, and holdForWithdrawal draws from earnings first, so the
 * whole existing withdrawal flow works unchanged.
 */
const creditVendorSale = (userId, amount, refs = {}, opts) =>
    applyMovements(userId, [{ bucket: 'earnings', type: 'vendor_sale', amount, quantity: 1, ...refs }], opts);

/** The sale was cancelled or returned after it had already paid out. */
const reverseVendorSale = (userId, amount, refs = {}, opts) =>
    applyMovements(
        userId,
        [{ bucket: 'earnings', type: 'vendor_sale_reversal', amount: -Math.abs(amount), quantity: 1, ...refs }],
        opts
    );

/**
 * Where the money came from and where it went, for one investor.
 *
 * Grouped by what the investor would call it rather than by bucket: "how much
 * of this is profit" and "how much came back as refunds" are the questions a
 * wallet has to answer, and neither is visible from two balances alone.
 *
 * Summed from the ledger, not from the stored balances — so it always ties out
 * to the statement below it.
 */
async function walletSummary(userId) {
    const rows = await WalletTransaction.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
        {
            $group: {
                _id: '$type',
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                units: { $sum: { $ifNull: ['$quantity', 0] } },
            },
        },
    ]);

    const by = (type) => rows.find((r) => r._id === type) ?? { total: 0, count: 0, units: 0 };
    const abs = (type) => round2(Math.abs(by(type).total));

    const inflow = {
        topups: abs('topup'),
        profit: abs('profit'),
        refunds: abs('refund'),
        principalReturned: abs('principal_returned'),
        openingBalance: abs('opening_balance'),
    };

    /**
     * Withdrawals come from the Withdrawal collection, not the wallet ledger.
     *
     * The ledger records that money left the buckets (`withdrawal_hold`) but
     * not whether the payout landed — settlement is a status change, and the
     * buckets are deliberately not debited twice. Reading `withdrawal_paid`
     * rows here reported every completed withdrawal as still "held", because
     * no such row is ever written (its amount would be 0, and zero movements
     * are dropped).
     *
     * A failed withdrawal nets to zero in the ledger (hold + release) and is
     * `failed` here, so it correctly appears in neither line.
     */
    const Withdrawal = require('../models/withdrawalModel');
    const withdrawalTotals = await Withdrawal.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
        { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const byStatus = (status) =>
        withdrawalTotals.find((r) => r._id === status) ?? { total: 0, count: 0 };

    const outflow = {
        invested: abs('investment'),
        withdrawn: round2(byStatus('paid').total),
        heldForWithdrawal: round2(byStatus('processing').total),
        profitReversed: abs('profit_reversal'),
        principalRedeployed: abs('principal_reversal'),
    };

    return {
        inflow,
        outflow,
        totalIn: round2(Object.values(inflow).reduce((a, b) => a + b, 0)),
        totalOut: round2(Object.values(outflow).reduce((a, b) => a + b, 0)),
        counts: {
            topups: by('topup').count,
            investments: by('investment').count,
            unitsFunded: by('investment').units,
            salesSettled: by('profit').count,
            refunds: by('refund').count,
            withdrawals: byStatus('paid').count,
            withdrawalsPending: byStatus('processing').count,
            withdrawalsFailed: byStatus('failed').count,
        },
    };
}

/**
 * Per-product money movement: what each product took and gave back.
 *
 * "Which products actually made me money" needs the ledger grouped by product,
 * which neither the statement nor the balances can answer on their own.
 */
async function walletByProduct(userId) {
    const Product = require('../models/productModel');

    const rows = await WalletTransaction.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(String(userId)),
                product: { $ne: null },
            },
        },
        {
            $group: {
                _id: { product: '$product', type: '$type' },
                total: { $sum: '$amount' },
                units: { $sum: { $ifNull: ['$quantity', 0] } },
            },
        },
    ]);

    const byProduct = new Map();
    for (const row of rows) {
        const key = String(row._id.product);
        if (!byProduct.has(key)) {
            byProduct.set(key, {
                product: key,
                name: null,
                invested: 0,
                unitsFunded: 0,
                profit: 0,
                refunded: 0,
                principalReturned: 0,
            });
        }
        const entry = byProduct.get(key);
        const amount = round2(Math.abs(row.total));

        if (row._id.type === 'investment') {
            entry.invested = amount;
            entry.unitsFunded = row.units;
        } else if (row._id.type === 'profit' || row._id.type === 'opening_balance') {
            // `opening_balance` is profit too — just profit from units that
            // sold before the wallet existed. Counting it separately would
            // leave the profit column reading ₹0 for every historical unit.
            entry.profit = round2(entry.profit + amount);
        } else if (row._id.type === 'profit_reversal') {
            entry.profit = round2(entry.profit - amount);
        } else if (row._id.type === 'refund') {
            entry.refunded = amount;
        } else if (row._id.type === 'principal_returned') {
            entry.principalReturned = amount;
        }
    }

    const products = await Product.find({ _id: { $in: [...byProduct.keys()] } }).select('name images');
    for (const product of products) {
        const entry = byProduct.get(String(product._id));
        if (entry) {
            entry.name = product.name;
            entry.image = product.images?.find((i) => i.isFeatured)?.url || product.images?.[0]?.url;
        }
    }

    return [...byProduct.values()].sort((a, b) => b.profit - a.profit);
}

/**
 * Reserve money for a withdrawal.
 *
 * Drawn from earnings first so capital stays available to invest, then from
 * capital for the remainder. The buckets are debited immediately and the total
 * parked in `pendingWithdrawal` — the balance must stop being spendable the
 * instant a payout is requested, or the same money could fund units while it
 * is on its way to a bank.
 *
 * Returns the split, which the withdrawal records so a release can put the
 * money back where it came from.
 */
async function holdForWithdrawal(userId, amount, withdrawalId, opts) {
    const requested = round2(amount);
    const wallet = await Wallet.forUser(userId);

    const fromEarnings = round2(Math.min(wallet.earnings, requested));
    const fromCapital = round2(requested - fromEarnings);

    const movements = [
        {
            bucket: 'earnings',
            type: 'withdrawal_hold',
            amount: -fromEarnings,
            withdrawal: withdrawalId,
        },
        {
            bucket: 'capital',
            type: 'withdrawal_hold',
            amount: -fromCapital,
            withdrawal: withdrawalId,
        },
    ];

    const result = await applyMovements(userId, movements, opts);

    // Mirrored onto the wallet so "where is my money" has an answer while the
    // payout is in flight. Not a bucket: it is neither spendable nor gone.
    await Wallet.updateOne(
        { user: userId },
        { $inc: { pendingWithdrawal: requested } },
        { session: opts?.session }
    );

    return { ...result, fromEarnings, fromCapital };
}

/** The payout landed. The hold is consumed; the money is gone for real. */
async function settleWithdrawal(userId, withdrawal, opts) {
    await applyMovements(
        userId,
        [
            {
                bucket: 'capital',
                type: 'withdrawal_paid',
                amount: 0,
                withdrawal: withdrawal._id,
                note: `Paid out — ₹${round2(withdrawal.amount).toFixed(2)}`,
            },
        ],
        opts
    );

    // The buckets were already debited at hold time, so only the pending
    // mirror moves here. A zero-amount row above would be dropped by
    // applyMovements, which is why `withdrawal_paid` is recorded by the
    // controller as a status change rather than as a second debit.
    await Wallet.updateOne(
        { user: userId },
        { $inc: { pendingWithdrawal: -round2(withdrawal.amount) } },
        { session: opts?.session }
    );
}

/**
 * The payout failed or was reversed. Put the money back exactly where it came
 * from, using the split recorded on the withdrawal.
 */
async function releaseWithdrawal(userId, withdrawal, reason, opts) {
    const result = await applyMovements(
        userId,
        [
            {
                bucket: 'earnings',
                type: 'withdrawal_released',
                amount: round2(withdrawal.fromEarnings),
                withdrawal: withdrawal._id,
                note: reason || 'Payout failed',
            },
            {
                bucket: 'capital',
                type: 'withdrawal_released',
                amount: round2(withdrawal.fromCapital),
                withdrawal: withdrawal._id,
                note: reason || 'Payout failed',
            },
        ],
        opts
    );

    await Wallet.updateOne(
        { user: userId },
        { $inc: { pendingWithdrawal: -round2(withdrawal.amount) } },
        { session: opts?.session }
    );

    return result;
}

module.exports = {
    applyMovements,
    holdForWithdrawal,
    settleWithdrawal,
    releaseWithdrawal,
    getWallet,
    withdrawableOf,
    walletSummary,
    walletByProduct,
    creditTopup,
    debitInvestment,
    creditRefund,
    creditSale,
    reverseSale,
    creditVendorSale,
    reverseVendorSale,
    InsufficientFunds,
    round2,
    BUCKETS,
};
