const WalletTransaction = require('../models/walletTransactionModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');
const { getWallet, creditTopup, walletSummary, walletByProduct } = require('../utils/wallet');
const {
    getRazorpayInstance,
    isPaymentsMocked,
    mockPaymentIdFor,
    verifyPaymentSignature,
} = require('../utils/razorpayInstance');

/**
 * The investor wallet: the only rail investor money travels on.
 *
 * Money in is a Razorpay payment verified here and credited to `capital`.
 * Money out is a withdrawal (see withdrawalController). Investing debits
 * capital; a sale credits the principal back to capital and the margin to
 * `earnings`.
 */

// Current balances ---INVESTOR
exports.getMyWallet = asyncErrorHandler(async (req, res) => {
    const wallet = await getWallet(req.user.id);

    res.status(200).json({
        success: true,
        wallet: {
            capital: wallet.capital,
            earnings: wallet.earnings,
            pendingWithdrawal: wallet.pendingWithdrawal,
            withdrawable: wallet.withdrawable,
        },
    });
});

// Statement ---INVESTOR
//
// Newest first, with the balance that followed each row already stored on it
// so the client never has to reconstruct a running total.
exports.getMyStatement = asyncErrorHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const filter = { user: req.user.id };
    if (req.query.bucket === 'capital' || req.query.bucket === 'earnings') {
        filter.bucket = req.query.bucket;
    }

    const [rows, total] = await Promise.all([
        WalletTransaction.find(filter)
            .populate('product', 'name images')
            .populate('investment', 'status')
            // So a withdrawal_hold row can read "Withdrawn" once it settles,
            // rather than "requested" forever.
            .populate('withdrawal', 'status utr settledAt')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        WalletTransaction.countDocuments(filter),
    ]);

    res.status(200).json({
        success: true,
        rows,
        total,
        page,
        limit,
    });
});

// Where the money came from and went ---INVESTOR
//
// The balances say what is left; this says how it got there. Both are summed
// from the same ledger as the statement, so the three always agree.
exports.getMySummary = asyncErrorHandler(async (req, res) => {
    const [summary, byProduct] = await Promise.all([
        walletSummary(req.user.id),
        walletByProduct(req.user.id),
    ]);

    res.status(200).json({
        success: true,
        summary,
        byProduct,
    });
});

// Open a Razorpay order to top up ---INVESTOR
//
// Mirrors the customer checkout flow: the gateway order is created here, the
// client pays, and `verifyTopup` credits the wallet only after the signature
// checks out. In PAYMENTS_MOCK mode a ready-made proof comes back so the
// whole flow is testable with no gateway involved.
exports.createTopupOrder = asyncErrorHandler(async (req, res, next) => {
    const amount = Number(req.body.amount);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
        return next(new ErrorHandler("Enter an amount to add", 400));
    }

    // A floor, because the gateway rejects sub-rupee payments and a ₹0.50
    // top-up is never what someone meant.
    if (amount < 1) {
        return next(new ErrorHandler("The minimum top-up is ₹1", 400));
    }

    if (amount > 1_000_000) {
        return next(new ErrorHandler("That top-up is too large. Please contact support", 400));
    }

    const amountInPaise = Math.round(amount * 100);

    const order = await getRazorpayInstance().orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `wallet_${req.user.id}_${Date.now()}`,
        notes: { purpose: 'wallet_topup', user: String(req.user.id) },
    });

    res.status(200).json({
        success: true,
        order,
        key_id: process.env.RAZORPAY_KEY_ID || null,
        mock: isPaymentsMocked(),
        // Only present in mock mode — the client submits it straight back to
        // /wallet/topup/verify, exactly as the real gateway's proof would be.
        mockPayment: isPaymentsMocked()
            ? {
                  razorpay_order_id: order.id,
                  razorpay_payment_id: mockPaymentIdFor(amountInPaise),
                  razorpay_signature: 'mock_signature',
              }
            : undefined,
    });
});

// Credit a verified top-up ---INVESTOR
exports.verifyTopup = asyncErrorHandler(async (req, res, next) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return next(new ErrorHandler("Missing payment details", 400));
    }

    // Verified here and not trusted from the client, for the same reason the
    // investment flow used to: a client claiming it already verified proves
    // nothing.
    if (!verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature })) {
        return next(new ErrorHandler("Payment verification failed! Invalid signature", 400));
    }

    const payment = await getRazorpayInstance().payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
        return next(new ErrorHandler("Payment not successful", 400));
    }

    // The amount comes from the gateway, never from the request body — the
    // client must not be able to name its own credit.
    const amount = Number((payment.amount / 100).toFixed(2));

    try {
        const { wallet } = await creditTopup(req.user.id, amount, razorpay_payment_id);

        res.status(200).json({
            success: true,
            message: `₹${amount.toFixed(2)} added to your wallet`,
            wallet: {
                capital: wallet.capital,
                earnings: wallet.earnings,
                withdrawable: wallet.withdrawable,
            },
        });
    } catch (err) {
        // The unique index on (type, reference) is what actually prevents a
        // replayed payment id from being credited twice — checking first would
        // leave a race between the check and the write.
        if (err.code === 11000) {
            return next(new ErrorHandler("This payment has already been credited", 400));
        }
        throw err;
    }
});
