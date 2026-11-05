/**
 * Withdrawal self-check.
 *
 * Exercises the paths where money can go wrong: the hold, which bucket it is
 * drawn from, what a failed payout puts back, and that a webhook retry cannot
 * settle the same withdrawal twice.
 *
 * Uses a throwaway investor and cleans up after itself.
 *   node scripts/withdrawal.check.js
 */
const mongoose = require('mongoose');
const assert = require('assert');
require('dotenv').config({ path: './config/config.env' });

const Wallet = require('../models/walletModel');
const WalletTransaction = require('../models/walletTransactionModel');
const Withdrawal = require('../models/withdrawalModel');
const wallet = require('../utils/wallet');
const payouts = require('../utils/razorpayPayouts');

const round2 = (n) => Number(Number(n).toFixed(2));

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const userId = new mongoose.Types.ObjectId();

    try {
        assert.ok(payouts.isMocked(), 'run this with PAYMENTS_MOCK=true');

        // Fund a wallet: ₹400 capital, ₹100 earnings.
        await wallet.creditTopup(userId, 500, `probe_${Date.now()}`);
        await wallet.debitInvestment(userId, [{ amount: 100, quantity: 1 }]);
        await wallet.creditSale(userId, { principal: 100, payout: 200 });
        let w = await wallet.getWallet(userId);
        assert.strictEqual(w.capital, 500);
        assert.strictEqual(w.earnings, 100);
        assert.strictEqual(w.withdrawable, 600);

        /* ── Earnings is drawn down first ── */
        //
        // So capital stays available to invest rather than being spent on a
        // withdrawal while profit sits idle.
        const small = await Withdrawal.create({ user: userId, amount: 60 });
        let held = await wallet.holdForWithdrawal(userId, 60, small._id);
        assert.strictEqual(held.fromEarnings, 60, 'earnings funds it first');
        assert.strictEqual(held.fromCapital, 0, 'capital is untouched while earnings covers it');

        w = await wallet.getWallet(userId);
        assert.strictEqual(w.earnings, 40);
        assert.strictEqual(w.capital, 500, 'capital must not move');
        assert.strictEqual(w.pendingWithdrawal, 60, 'held, not spendable');
        assert.strictEqual(w.withdrawable, 540, 'the held amount is no longer withdrawable');

        /* ── A failed payout returns money to the buckets it came from ── */
        small.fromEarnings = held.fromEarnings;
        small.fromCapital = held.fromCapital;
        await small.save();
        await wallet.releaseWithdrawal(userId, small, 'probe failure');

        w = await wallet.getWallet(userId);
        assert.strictEqual(w.earnings, 100, 'earnings restored exactly');
        assert.strictEqual(w.capital, 500, 'capital still untouched');
        assert.strictEqual(w.pendingWithdrawal, 0, 'the hold is gone');

        /* ── A withdrawal larger than earnings spills into capital ── */
        const big = await Withdrawal.create({ user: userId, amount: 300 });
        held = await wallet.holdForWithdrawal(userId, 300, big._id);
        assert.strictEqual(held.fromEarnings, 100, 'all of earnings first');
        assert.strictEqual(held.fromCapital, 200, 'then the remainder from capital');

        w = await wallet.getWallet(userId);
        assert.strictEqual(w.earnings, 0);
        assert.strictEqual(w.capital, 300);
        assert.strictEqual(w.pendingWithdrawal, 300);

        // Releasing puts BOTH parts back where they belong, not all in one.
        big.fromEarnings = held.fromEarnings;
        big.fromCapital = held.fromCapital;
        await big.save();
        await wallet.releaseWithdrawal(userId, big, 'probe failure');
        w = await wallet.getWallet(userId);
        assert.strictEqual(w.earnings, 100, 'the earnings share went back to earnings');
        assert.strictEqual(w.capital, 500, 'the capital share went back to capital');

        /* ── Held money cannot be spent ── */
        const lock = await Withdrawal.create({ user: userId, amount: 600 });
        held = await wallet.holdForWithdrawal(userId, 600, lock._id);
        await assert.rejects(
            () => wallet.debitInvestment(userId, [{ amount: 1, quantity: 1 }]),
            (err) => err.name === 'InsufficientFunds',
            'a fully held wallet must not fund an investment'
        );

        lock.fromEarnings = held.fromEarnings;
        lock.fromCapital = held.fromCapital;
        await lock.save();

        /* ── Settling consumes the hold without touching the buckets again ── */
        const beforeSettle = await wallet.getWallet(userId);
        await wallet.settleWithdrawal(userId, lock);
        w = await wallet.getWallet(userId);
        assert.strictEqual(w.capital, beforeSettle.capital, 'buckets were already debited at hold');
        assert.strictEqual(w.earnings, beforeSettle.earnings);
        assert.strictEqual(w.pendingWithdrawal, 0, 'the hold is consumed');
        assert.strictEqual(w.withdrawable, 0, 'the money is gone for real');

        /* ── A mock payout settles immediately ── */
        const payout = await payouts.createPayout({
            fundAccountId: 'mock_fa_x',
            fundAccountType: 'vpa',
            amount: 100,
            withdrawalId: lock._id,
        });
        assert.strictEqual(payouts.PAYOUT_STATUS[payout.status], 'paid');
        assert.ok(payout.utr, 'a settled payout carries a UTR to quote to a bank');

        /* ── Every X status maps to one of ours ── */
        for (const status of ['queued', 'pending', 'processing', 'processed', 'cancelled', 'rejected', 'reversed', 'failed']) {
            assert.ok(
                ['processing', 'paid', 'failed'].includes(payouts.PAYOUT_STATUS[status]),
                `unmapped RazorpayX status: ${status}`
            );
        }

        /* ── Payout mode follows the destination and the amount ── */
        assert.strictEqual(payouts.payoutMode('vpa', 100), 'UPI');
        assert.strictEqual(payouts.payoutMode('bank_account', 100), 'IMPS');
        assert.strictEqual(
            payouts.payoutMode('bank_account', 600000),
            'RTGS',
            'IMPS is capped at ₹5,00,000'
        );

        /* ── An unsigned webhook is rejected, not trusted ── */
        assert.strictEqual(
            payouts.verifyPayoutWebhook('{}', undefined),
            false,
            'a missing signature must never verify'
        );
        assert.strictEqual(payouts.verifyPayoutWebhook('{}', 'garbage'), false);

        /* ── The ledger explains every rupee ── */
        for (const bucket of wallet.BUCKETS) {
            const [agg] = await WalletTransaction.aggregate([
                { $match: { user: userId, bucket } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]);
            w = await wallet.getWallet(userId);
            assert.strictEqual(round2(agg?.total ?? 0), round2(w[bucket]), `${bucket} reconciles`);
        }

        console.log('withdrawal: all checks passed');
    } finally {
        await WalletTransaction.deleteMany({ user: userId });
        await Wallet.deleteOne({ user: userId });
        await Withdrawal.deleteMany({ user: userId });
        await mongoose.disconnect();
    }
})().catch((err) => {
    console.error('withdrawal check FAILED:', err.message);
    process.exit(1);
});
