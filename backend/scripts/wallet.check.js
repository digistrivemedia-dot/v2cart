/**
 * Wallet self-check and reconciliation.
 *
 * Two jobs:
 *
 *   1. RECONCILE — for every wallet, assert the stored balance equals the sum
 *      of its ledger rows, per bucket. A mismatch means something moved money
 *      without going through utils/wallet.js, which is the one thing that
 *      must never happen. Read-only.
 *
 *   2. EXERCISE — run a throwaway investor through the whole money cycle and
 *      assert each balance, including the concurrency guard that makes a
 *      double-spend impossible. Writes, then cleans up after itself.
 *
 *   node scripts/wallet.check.js              both
 *   node scripts/wallet.check.js --reconcile  reconcile only (safe on prod)
 */
const mongoose = require('mongoose');
const assert = require('assert');
require('dotenv').config({ path: './config/config.env' });

const Wallet = require('../models/walletModel');
const WalletTransaction = require('../models/walletTransactionModel');
const wallet = require('../utils/wallet');

const reconcileOnly = process.argv.includes('--reconcile');
const round2 = (n) => Number(Number(n).toFixed(2));

async function reconcile() {
    const wallets = await Wallet.find();
    let checked = 0;
    const problems = [];

    for (const w of wallets) {
        for (const bucket of wallet.BUCKETS) {
            const [agg] = await WalletTransaction.aggregate([
                { $match: { user: w.user, bucket } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]);
            const ledger = round2(agg?.total ?? 0);
            const stored = round2(w[bucket]);

            if (Math.abs(ledger - stored) > 0.005) {
                problems.push(
                    `user ${w.user} ${bucket}: stored ₹${stored}, ledger ₹${ledger} (diff ₹${round2(stored - ledger)})`
                );
            }
            checked++;
        }
    }

    console.log(`reconcile: ${wallets.length} wallet(s), ${checked} bucket(s) checked`);
    if (problems.length) {
        console.error('RECONCILIATION FAILED:');
        for (const p of problems) console.error('  ' + p);
        throw new Error(`${problems.length} bucket(s) out of balance`);
    }
    console.log('reconcile: every stored balance matches its ledger');
}

async function exercise() {
    const userId = new mongoose.Types.ObjectId();

    try {
        // A new wallet starts empty.
        let w = await wallet.getWallet(userId);
        assert.strictEqual(w.capital, 0);
        assert.strictEqual(w.earnings, 0);
        assert.strictEqual(await wallet.withdrawableOf(userId), 0);

        // Top up.
        ({ wallet: w } = await wallet.creditTopup(userId, 500, `probe_pay_${Date.now()}`));
        assert.strictEqual(w.capital, 500);

        // Fund a unit at ₹100 — capital only.
        ({ wallet: w } = await wallet.debitInvestment(userId, [{ amount: 100, quantity: 1 }]));
        assert.strictEqual(w.capital, 400);
        assert.strictEqual(w.earnings, 0, 'funding a unit must not touch earnings');

        // The unit sells at ₹120: principal back to capital, margin to earnings.
        ({ wallet: w } = await wallet.creditSale(userId, { principal: 100, payout: 120 }));
        assert.strictEqual(w.capital, 500, 'principal returned to capital');
        assert.strictEqual(w.earnings, 20, 'only the margin lands in earnings');
        assert.strictEqual(await wallet.withdrawableOf(userId), 520);

        // Net effect of a full cycle is exactly the margin.
        assert.strictEqual(round2(w.capital + w.earnings - 500), 20, 'a full cycle nets the margin');

        // Cancelling that order is the exact inverse.
        ({ wallet: w } = await wallet.reverseSale(userId, { principal: 100, payout: 120 }));
        assert.strictEqual(w.capital, 400, 'principal re-deployed');
        assert.strictEqual(w.earnings, 0, 'profit clawed back');

        // A price drop hands capital back.
        ({ wallet: w } = await wallet.creditRefund(userId, 25));
        assert.strictEqual(w.capital, 425);

        // Overspending is refused, and leaves the balance untouched.
        await assert.rejects(
            () => wallet.debitInvestment(userId, [{ amount: 10_000, quantity: 1 }]),
            (err) => {
                assert.strictEqual(err.name, 'InsufficientFunds');
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.bucket, 'capital');
                assert.strictEqual(err.available, 425);
                return true;
            }
        );
        w = await wallet.getWallet(userId);
        assert.strictEqual(w.capital, 425, 'a refused debit must not move the balance');

        // ── The double-spend guard ──
        //
        // Ten simultaneous ₹100 debits against ₹425: exactly four may win.
        // Reading the balance and then writing it would let all ten through.
        const attempts = await Promise.allSettled(
            Array.from({ length: 10 }, () =>
                wallet.debitInvestment(userId, [{ amount: 100, quantity: 1 }])
            )
        );
        const won = attempts.filter((a) => a.status === 'fulfilled').length;
        w = await wallet.getWallet(userId);
        assert.strictEqual(won, 4, `expected 4 concurrent debits to win, got ${won}`);
        assert.strictEqual(w.capital, 25, 'balance is exactly what survived');

        // Earnings cannot be overdrawn either.
        await assert.rejects(
            () => wallet.applyMovements(userId, [{ bucket: 'earnings', type: 'adjustment', amount: -1 }]),
            /Insufficient earnings/
        );

        // A zero movement writes nothing rather than a meaningless row.
        const before = await WalletTransaction.countDocuments({ user: userId });
        await wallet.creditSale(userId, { principal: 0, payout: 0 });
        assert.strictEqual(
            await WalletTransaction.countDocuments({ user: userId }),
            before,
            'a zero-amount movement must not be written'
        );

        // A zero-margin product still returns principal, without a ₹0 profit row.
        ({ wallet: w } = await wallet.creditSale(userId, { principal: 25, payout: 25 }));
        assert.strictEqual(w.capital, 50);
        assert.strictEqual(w.earnings, 0);

        // An unknown bucket is a programming error, not a silent no-op.
        await assert.rejects(
            () => wallet.applyMovements(userId, [{ bucket: 'bonus', type: 'adjustment', amount: 1 }]),
            /Unknown wallet bucket/
        );

        // Every row carries the balance that followed it.
        const rows = await WalletTransaction.find({ user: userId, bucket: 'capital' }).sort({ createdAt: 1 });
        let running = 0;
        for (const row of rows) {
            running = round2(running + row.amount);
            assert.strictEqual(
                row.balanceAfter,
                running,
                `balanceAfter drifted on a ${row.type} row`
            );
        }

        // And the probe wallet reconciles, like any other.
        for (const bucket of wallet.BUCKETS) {
            const [agg] = await WalletTransaction.aggregate([
                { $match: { user: userId, bucket } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]);
            w = await wallet.getWallet(userId);
            assert.strictEqual(round2(agg?.total ?? 0), round2(w[bucket]), `${bucket} reconciles`);
        }

        console.log('exercise: full money cycle, guards and reconciliation all hold');
    } finally {
        await WalletTransaction.deleteMany({ user: userId });
        await Wallet.deleteOne({ user: userId });
    }
}

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    try {
        if (!reconcileOnly) await exercise();
        await reconcile();
        console.log('\nwallet: all checks passed');
    } finally {
        await mongoose.disconnect();
    }
})().catch((err) => {
    console.error('wallet check FAILED:', err.message);
    process.exit(1);
});
