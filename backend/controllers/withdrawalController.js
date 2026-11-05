const mongoose = require('mongoose');
const Withdrawal = require('../models/withdrawalModel');
const User = require('../models/userModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');
const {
    getWallet,
    holdForWithdrawal,
    settleWithdrawal,
    releaseWithdrawal,
    InsufficientFunds,
} = require('../utils/wallet');
const payouts = require('../utils/razorpayPayouts');

/**
 * Taking money out of the wallet, via RazorpayX payouts.
 *
 * Shared by investors AND vendors since Phase 23. A vendor's sale proceeds are
 * credited to the same `earnings` bucket at maturation, so the hold/pay/release
 * machinery below needed no change beyond reading their bank details off
 * `vendorProfile` instead — see profileKeyFor.
 *
 * ── The order of operations, and why ───────────────────────────────────────
 *
 *   1. validate the amount against the live balance
 *   2. HOLD the money (buckets debited, parked in pendingWithdrawal)
 *   3. create the RazorpayX payout
 *   4. a webhook settles it to paid, or releases the hold on failure
 *
 * Holding before calling the gateway is the important part. If the payout were
 * created first and the hold second, a crash in between would pay an investor
 * money their balance still showed as available. Holding first means the worst
 * case is money held with no payout — visible, releasable, and never a
 * double-spend.
 *
 * Step 3 failing rolls the hold straight back, so a rejected payout leaves the
 * wallet exactly as it was.
 */

/** Below this the gateway fee is a silly fraction of the transfer. */
const MIN_WITHDRAWAL = 100;

/**
 * The investor's RazorpayX contact + fund account, created once and reused.
 *
 * Cached on the user because creating a duplicate contact per withdrawal
 * clutters the X dashboard and costs an extra API round trip each time. A
 * change to payout details invalidates the cache — see `payoutFingerprint`.
 */
function payoutFingerprint(details = {}) {
    return [details.upiId, details.accountNumber, details.ifsc].map((v) => v || '').join('|');
}

/**
 * Which profile holds this user's bank details.
 *
 * Phase 23 — vendors withdraw through this same flow now, and their payout
 * details live on `vendorProfile`. Keyed on role rather than on which profile
 * happens to be populated, so a user who is somehow both cannot have money
 * paid into the wrong account.
 */
function profileKeyFor(user) {
    return user.role === 'vendor' ? 'vendorProfile' : 'investorProfile';
}

async function ensureFundAccount(user) {
    const profileKey = profileKeyFor(user);
    const details = user[profileKey]?.payoutDetails || {};
    const fingerprint = payoutFingerprint(details);

    if (!details.upiId && !(details.accountNumber && details.ifsc)) {
        throw new ErrorHandler(
            'Add a bank account (number + IFSC) or a UPI id to your '
            + `${profileKey === 'vendorProfile' ? 'vendor' : 'investor'} profile before withdrawing.`,
            400
        );
    }

    const cached = user[profileKey]?.payoutAccount;
    if (cached?.fundAccountId && cached.fingerprint === fingerprint) {
        return cached;
    }

    const contact = cached?.contactId
        ? { id: cached.contactId }
        : await payouts.createContact({
              name: details.accountName || user.name,
              email: user.email,
              phone: user.phoneNo ? String(user.phoneNo) : undefined,
              referenceId: String(user._id),
          });

    const fundAccount = await payouts.createFundAccount({
        contactId: contact.id,
        payoutDetails: details,
    });

    const payoutAccount = {
        contactId: contact.id,
        fundAccountId: fundAccount.id,
        accountType: fundAccount.account_type || (details.upiId ? 'vpa' : 'bank_account'),
        fingerprint,
    };

    await User.updateOne(
        { _id: user._id },
        { $set: { [`${profileKey}.payoutAccount`]: payoutAccount } }
    );

    return payoutAccount;
}

// Request a withdrawal ---INVESTOR
exports.requestWithdrawal = asyncErrorHandler(async (req, res, next) => {
    const amount = Number(req.body.amount);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
        return next(new ErrorHandler('Enter an amount to withdraw', 400));
    }

    if (amount < MIN_WITHDRAWAL) {
        return next(new ErrorHandler(`The minimum withdrawal is ₹${MIN_WITHDRAWAL}`, 400));
    }

    const rounded = Number(amount.toFixed(2));
    const wallet = await getWallet(req.user.id);

    if (rounded > wallet.withdrawable) {
        return next(new ErrorHandler(
            `You can withdraw up to ₹${wallet.withdrawable.toFixed(2)} right now.`,
            400
        ));
    }

    const user = await User.findById(req.user.id);

    // Resolved BEFORE any money moves: a missing bank account should be a
    // plain validation error, not a held balance waiting on a release.
    let payoutAccount;
    try {
        payoutAccount = await ensureFundAccount(user);
    } catch (err) {
        return next(err instanceof ErrorHandler ? err : new ErrorHandler(err.message, 400));
    }

    const details = user[profileKeyFor(user)]?.payoutDetails || {};

    const withdrawal = await Withdrawal.create({
        user: req.user.id,
        amount: rounded,
        status: 'processing',
        destination: {
            type: payoutAccount.accountType,
            upiId: details.upiId || null,
            accountLast4: details.accountNumber
                ? String(details.accountNumber).slice(-4)
                : null,
            ifsc: details.ifsc || null,
        },
    });

    // ── Hold first. See the note at the top of this file. ──
    try {
        const held = await holdForWithdrawal(req.user.id, rounded, withdrawal._id);
        withdrawal.fromEarnings = held.fromEarnings;
        withdrawal.fromCapital = held.fromCapital;
        await withdrawal.save();
    } catch (err) {
        await Withdrawal.deleteOne({ _id: withdrawal._id });
        if (err instanceof InsufficientFunds) {
            return next(new ErrorHandler(err.message, 400));
        }
        throw err;
    }

    // ── Then the payout. A failure here releases the hold immediately. ──
    try {
        const payout = await payouts.createPayout({
            fundAccountId: payoutAccount.fundAccountId,
            fundAccountType: payoutAccount.accountType,
            amount: rounded,
            withdrawalId: withdrawal._id,
            narration: 'InveztIN withdrawal',
        });

        withdrawal.payoutId = payout.id;
        withdrawal.mode = payout.mode || null;
        withdrawal.utr = payout.utr || null;
        withdrawal.status = payouts.PAYOUT_STATUS[payout.status] || 'processing';

        if (withdrawal.status === 'paid') {
            withdrawal.settledAt = new Date();
            await withdrawal.save();
            await settleWithdrawal(req.user.id, withdrawal);
        } else {
            await withdrawal.save();
        }
    } catch (err) {
        withdrawal.status = 'failed';
        withdrawal.failureReason = err.message;
        withdrawal.settledAt = new Date();
        await withdrawal.save();
        await releaseWithdrawal(req.user.id, withdrawal, 'Payout could not be created');

        return next(new ErrorHandler(
            `Withdrawal could not be started: ${err.message}. Your balance is unchanged.`,
            502
        ));
    }

    const updated = await getWallet(req.user.id);

    res.status(201).json({
        success: true,
        message: withdrawal.status === 'paid'
            ? `₹${rounded.toFixed(2)} has been paid out`
            : `₹${rounded.toFixed(2)} is on its way to your account`,
        withdrawal,
        wallet: {
            capital: updated.capital,
            earnings: updated.earnings,
            pendingWithdrawal: updated.pendingWithdrawal,
            withdrawable: updated.withdrawable,
        },
    });
});

// My withdrawals ---INVESTOR
exports.myWithdrawals = asyncErrorHandler(async (req, res) => {
    const withdrawals = await Withdrawal.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .limit(100);

    res.status(200).json({
        success: true,
        withdrawals,
        minWithdrawal: MIN_WITHDRAWAL,
    });
});

/**
 * RazorpayX webhook — the only thing that marks a payout paid.
 *
 * The create call returns `queued`, so settlement has to be confirmed out of
 * band. Unauthenticated by necessity (X calls it), which is exactly why the
 * signature check is not optional: without it anyone could POST
 * "payout.processed" and have a withdrawal marked settled.
 *
 * Idempotent — X retries until it gets a 2xx, and the same event can arrive
 * several times.
 */
exports.payoutWebhook = asyncErrorHandler(async (req, res, next) => {
    const signature = req.headers['x-razorpay-signature'];
    // Needs the raw body, not the parsed object — see app.js.
    const raw = req.rawBody || JSON.stringify(req.body);

    if (!payouts.verifyPayoutWebhook(raw, signature)) {
        return next(new ErrorHandler('Invalid webhook signature', 400));
    }

    const event = req.body?.event;
    const payout = req.body?.payload?.payout?.entity;

    if (!payout?.id) {
        // 200 on purpose: a malformed event is not something X should retry.
        return res.status(200).json({ success: true, ignored: 'no payout entity' });
    }

    const withdrawal = await Withdrawal.findOne({ payoutId: payout.id });

    if (!withdrawal) {
        return res.status(200).json({ success: true, ignored: 'unknown payout' });
    }

    const next_status = payouts.PAYOUT_STATUS[payout.status] || 'processing';

    // Already settled — a retry of an event we've handled.
    if (withdrawal.status === next_status || withdrawal.status === 'paid') {
        return res.status(200).json({ success: true, duplicate: true });
    }

    if (next_status === 'paid') {
        withdrawal.status = 'paid';
        withdrawal.utr = payout.utr || withdrawal.utr;
        withdrawal.settledAt = new Date();
        await withdrawal.save();
        await settleWithdrawal(withdrawal.user, withdrawal);
    } else if (next_status === 'failed') {
        withdrawal.status = 'failed';
        withdrawal.failureReason =
            payout.failure_reason || payout.status_details?.description || event || 'Payout failed';
        withdrawal.settledAt = new Date();
        await withdrawal.save();
        // The money goes back to the buckets it came from.
        await releaseWithdrawal(withdrawal.user, withdrawal, withdrawal.failureReason);
    } else {
        withdrawal.status = next_status;
        await withdrawal.save();
    }

    res.status(200).json({ success: true, status: withdrawal.status });
});

/**
 * Re-read a payout's status from RazorpayX ---INVESTOR
 *
 * A safety net for a webhook that never arrived (misconfigured secret, a
 * dropped delivery). Pulls the authoritative status and applies the same
 * transitions the webhook would.
 */
exports.syncWithdrawal = asyncErrorHandler(async (req, res, next) => {
    const withdrawal = await Withdrawal.findOne({ _id: req.params.id, user: req.user.id });

    if (!withdrawal) {
        return next(new ErrorHandler('Withdrawal not found', 404));
    }

    if (withdrawal.status !== 'processing' || !withdrawal.payoutId) {
        return res.status(200).json({ success: true, withdrawal });
    }

    const payout = await payouts.fetchPayout(withdrawal.payoutId);
    const next_status = payouts.PAYOUT_STATUS[payout.status] || 'processing';

    if (next_status === 'paid') {
        withdrawal.status = 'paid';
        withdrawal.utr = payout.utr || withdrawal.utr;
        withdrawal.settledAt = new Date();
        await withdrawal.save();
        await settleWithdrawal(withdrawal.user, withdrawal);
    } else if (next_status === 'failed') {
        withdrawal.status = 'failed';
        withdrawal.failureReason = payout.failure_reason || 'Payout failed';
        withdrawal.settledAt = new Date();
        await withdrawal.save();
        await releaseWithdrawal(withdrawal.user, withdrawal, withdrawal.failureReason);
    }

    res.status(200).json({ success: true, withdrawal });
});

exports.MIN_WITHDRAWAL = MIN_WITHDRAWAL;
