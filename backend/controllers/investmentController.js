const mongoose = require('mongoose');
const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const Product = require('../models/productModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');
const { mergeInvestItems } = require('../utils/investmentBatch');
const { debitInvestment, getWallet, InsufficientFunds } = require('../utils/wallet');
const PlatformSettings = require('../models/platformSettingsModel');
const { resolveBands, forecastPayout, settlePayout } = require('../utils/marginBands');

// Place a batch of investments ---INVESTOR
//
// Funded from the investor's wallet, never from a card. The wallet is the only
// rail investor money travels on, so this takes no payment details at all:
// it debits `capital` and writes the investments in one transaction.
//
// The debit is a conditional update inside that transaction (see
// utils/wallet.js), which is what makes two simultaneous investments unable to
// spend the same balance — the old card flow guarded against a replayed
// payment id instead, and that question no longer exists.
exports.invest = asyncErrorHandler(async (req, res, next) => {

    const { items, razorpay_payment_id } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return next(new ErrorHandler("No items to invest in", 400));
    }

    // A client still sending gateway proof is running the old card flow. It
    // would be charged by Razorpay AND debited from the wallet — the same
    // money taken twice. Refuse rather than silently ignore the extra field,
    // until every client is updated to fund from the wallet.
    if (razorpay_payment_id) {
        return next(new ErrorHandler(
            "Investments are funded from your wallet now, not by card. "
            + "Please reload the page to get the updated checkout.",
            400
        ));
    }

    // Merge duplicate product lines so per-product availability is checked once.
    let quantityByProduct;
    try {
        quantityByProduct = mergeInvestItems(items);
    } catch (err) {
        return next(new ErrorHandler("Invalid item in investment cart", 400));
    }

    // Loaded once for the whole cart: a product with no bands of its own
    // snapshots the platform defaults, so every investment carries a complete
    // set of rules regardless of whether admin filled them in.
    const settings = await PlatformSettings.getSingleton();

    let expectedTotal = 0;
    const validatedLines = [];

    for (const [productId, quantity] of quantityByProduct) {
        const product = await Product.findById(productId);

        if (!product) {
            return next(new ErrorHandler("Product Not Found", 404));
        }

        if (product.listingStatus !== 'live') {
            return next(new ErrorHandler(`${product.name} is not open for investment`, 400));
        }

        if (product.investorPrice === null || product.investorPrice === undefined) {
            return next(new ErrorHandler(`${product.name} does not accept investment`, 400));
        }

        // Capacity is UNITS ON HAND that nobody has funded yet.
        //
        // Phase 23 fix. This counted every investment ever made against the
        // CURRENT stock, so each sale consumed a slot and a stock unit both:
        // stock 10 with 5 funded and 5 sold read as 0 remaining while 5
        // unfunded units sat on the shelf, and the product vanished from the
        // investor listing. Matched investments are excluded because their
        // unit has already shipped — its stock left with it.
        const investableUnits = product.investableUnits ?? product.stock;
        const fundedUnsold = await Investment.countDocuments({
            product: product._id,
            status: 'unmatched',
        });

        if (fundedUnsold + quantity > investableUnits) {
            return next(new ErrorHandler(
                `Only ${Math.max(investableUnits - fundedUnsold, 0)} unit(s) left to invest in for ${product.name}`,
                400
            ));
        }

        expectedTotal += product.investorPrice * quantity;
        // The bands this investor is buying into, frozen now. Admin editing the
        // product's rules afterwards must not change what this unit is owed —
        // see utils/marginBands.js settlePayout.
        validatedLines.push({
            product,
            quantity,
            bands: resolveBands(product, settings),
        });
    }

    // Rounded to paise before the debit: investor prices are
    // listingPrice/(1+margin) and so are usually fractional, which means
    // summing them across a cart lands on values like 29.159999999999997.
    expectedTotal = Number(expectedTotal.toFixed(2));

    // Checked up front purely so the investor gets "top up ₹X more" rather
    // than a bare failure. The authoritative guard is the conditional debit
    // below — this one can go stale between here and there, and that is fine.
    const wallet = await getWallet(req.user.id);
    if (wallet.capital < expectedTotal) {
        return next(new ErrorHandler(
            `Wallet balance too low. This needs ₹${expectedTotal.toFixed(2)} of capital; `
            + `you have ₹${wallet.capital.toFixed(2)}. Top up ₹${(expectedTotal - wallet.capital).toFixed(2)} to continue.`,
            400
        ));
    }

    const session = await mongoose.startSession();
    const investments = [];

    try {
        await session.withTransaction(async () => {
            // Written first so the ledger rows below can reference them, and so
            // a failed debit rolls the whole lot back.
            for (const { product, quantity, bands } of validatedLines) {
                for (let i = 0; i < quantity; i++) {
                    const [investment] = await Investment.create([{
                        investor: req.user.id,
                        product: product._id,
                        amountInvested: product.investorPrice,
                        // A forecast under the product's current band. The
                        // figure actually paid is computed at settlement from
                        // how long THIS unit took to sell.
                        expectedPayout: forecastPayout(
                            product.investorPrice,
                            bands,
                            product.marginCategory
                        ),
                        marginBands: bands,
                        // No paymentId: funded from the wallet, so there is no
                        // gateway payment behind this unit. The wallet ledger is
                        // the record of where the money came from.
                        paymentId: null,
                    }], { session });
                    investments.push(investment);

                    // Business ledger — unchanged, so earnings dashboards and
                    // reports keep aggregating exactly as before.
                    await Transaction.create([{
                        type: 'investor_investment',
                        user: req.user.id,
                        product: product._id,
                        investment: investment._id,
                        amount: product.investorPrice,
                    }], { session });
                }
            }

            // Cash ledger — one debit per product, carrying the product and
            // the unit count, so the statement can say what was funded rather
            // than showing an unattributable lump sum.
            await debitInvestment(
                req.user.id,
                validatedLines.map(({ product, quantity }) => ({
                    product: product._id,
                    quantity,
                    amount: Number((product.investorPrice * quantity).toFixed(2)),
                })),
                { session }
            );
        });
    } catch (err) {
        if (err instanceof InsufficientFunds) {
            return next(new ErrorHandler(err.message, 400));
        }
        throw err;
    } finally {
        await session.endSession();
    }

    const updated = await getWallet(req.user.id);

    res.status(201).json({
        success: true,
        investments,
        wallet: { capital: updated.capital, earnings: updated.earnings },
    });
});

// Get logged-in investor's own investments, with the cash that actually moved
// on each one attached.
//
// `amountInvested` alone can't answer "what did this unit do for me": it's
// rewritten in place when a price drop refunds part of the capital (see
// utils/repriceInvestments.js), and a cancelled order reverses a payout that
// was already booked. Both of those live in the ledger, so the per-unit
// history is summed from there rather than inferred from the current snapshot.
exports.myInvestments = asyncErrorHandler(async (req, res, next) => {

    const investments = await Investment.find({ investor: req.user.id })
        .sort({ createdAt: -1 })
        // Phase 21 — `orderItems` and `deliveredAt` come along because a sold
        // unit is no longer necessarily a paid one: the line carries the return
        // window that decides when this investor's money is released.
        .populate('matchedOrder', 'orderStatus createdAt deliveredAt orderItems')
        .populate('product', 'name images price investorPrice investorPayout listingStatus');

    const ledger = await Transaction.aggregate([
        {
            $match: {
                user: req.user._id,
                investment: { $ne: null },
                type: { $in: ['investor_refund', 'investor_payout', 'investor_reversal'] },
            },
        },
        { $group: { _id: { investment: '$investment', type: '$type' }, total: { $sum: '$amount' } } },
    ]);

    const byInvestment = new Map();
    for (const row of ledger) {
        const key = String(row._id.investment);
        const entry = byInvestment.get(key) || { refunded: 0, realisedPayout: 0 };
        if (row._id.type === 'investor_refund') {
            // Stored negative (money leaving the investor's invested balance).
            entry.refunded += -row.total;
        } else {
            // payout is positive, reversal is negative — they net out when an
            // order is cancelled, which is exactly what "realised" should mean.
            entry.realisedPayout += row.total;
        }
        byInvestment.set(key, entry);
    }

    let maturingTotal = 0;

    const enriched = investments.map((investment) => {
        const history = byInvestment.get(String(investment._id)) || { refunded: 0, realisedPayout: 0 };
        const settlement = settlementStateOf(investment, history.realisedPayout);

        if (settlement.state === 'maturing') {
            maturingTotal += settlement.pendingPayout;
        }

        return {
            ...investment.toObject(),
            // Capital handed back because the product's price dropped after
            // this unit was funded.
            refundedTotal: Number(history.refunded.toFixed(2)),
            // What this unit has actually paid out so far — 0 while unmatched,
            // and back to 0 if its order was later cancelled.
            realisedPayout: Number(history.realisedPayout.toFixed(2)),
            // Phase 21 — 'unmatched' | 'maturing' | 'paid'. `maturing` is the
            // new one: the unit HAS sold, but the customer can still send it
            // back, so the money is not this investor's yet.
            ...settlement,
        };
    });

    res.status(200).json({
        success: true,
        investments: enriched,
        // Sold, but still inside a return window. Shown as its own figure
        // rather than folded into earnings, because it is not spendable and
        // it can still go back to zero if the customer returns the goods.
        maturingTotal: Number(maturingTotal.toFixed(2)),
    });
});

/**
 * Where one investment stands in the Phase 21 settlement lifecycle.
 *
 * Derived rather than stored, which is what keeps it from going stale: the
 * truth is "is there a `settledAt` on the order line that matched this unit",
 * and that is one lookup through the populated order.
 *
 * `pendingPayout` is computed with the same `settlePayout` the real settlement
 * will use, against the same `matchedAt` — so the figure an investor is shown
 * while waiting is exactly the figure that lands, not an optimistic forecast.
 */
function settlementStateOf(investment, realisedPayout = 0) {
    if (investment.status !== 'matched') {
        return { state: 'unmatched', maturesAt: null, pendingPayout: 0 };
    }

    // Already paid, by either of two independent pieces of evidence:
    //
    //   • `payoutPaid` — stamped by settlement since Phase 20.
    //   • a realised `investor_payout` row — the money provably moved.
    //
    // The second is what covers investments settled BEFORE Phase 20, which
    // have no `payoutPaid` at all. Without it every one of those would report
    // as `maturing` and the investor would be shown a payout they were already
    // given, waiting on a return window that never existed.
    if (investment.payoutPaid != null || realisedPayout > 0) {
        return {
            state: 'paid',
            maturesAt: null,
            pendingPayout: 0,
            paidAmount: investment.payoutPaid ?? realisedPayout,
            paidPct: investment.payoutPct,
        };
    }

    const order = investment.matchedOrder;
    const line = order?.orderItems?.find(
        (item) => String(item.product) === String(investment.product?._id ?? investment.product)
    );
    const { payoutPaid, payoutPct } = settlePayout(investment);

    return {
        state: 'maturing',
        // Null until the order is delivered — the clock has not started, so
        // the honest answer is "not yet known" rather than a guessed date.
        maturesAt: line?.maturesAt ?? null,
        returnWindowDays: line?.returnWindowDays ?? null,
        orderStatus: order?.orderStatus ?? null,
        deliveredAt: order?.deliveredAt ?? null,
        pendingPayout: payoutPaid,
        pendingPct: payoutPct,
    };
}

// Aggregate this investor's earnings by transaction type
exports.myEarnings = asyncErrorHandler(async (req, res, next) => {

    const rows = await Transaction.aggregate([
        { $match: { user: req.user._id } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);

    const totals = {
        totalInvested: 0,
        totalPaidOut: 0,
    };

    for (const row of rows) {
        if (row._id === 'investor_investment') totals.totalInvested += row.total;
        if (row._id === 'investor_refund') totals.totalInvested += row.total;   // negative, nets out
        if (row._id === 'investor_payout') totals.totalPaidOut += row.total;
        if (row._id === 'investor_reversal') totals.totalPaidOut += row.total;  // negative, nets out
    }

    // Phase 21 — units that have SOLD but whose money is still inside a return
    // window. Deliberately not added into `totalPaidOut`: nothing has been paid
    // and a return takes it back to zero. It is summed from the investments
    // rather than the ledger because the ledger has no row for it yet — that is
    // the whole design (see utils/settlement.js).
    // Investments settled before Phase 20 have no `payoutPaid`, so the flag
    // alone would count money the investor has already been given. Excluded by
    // the ledger row that proves it moved — same reasoning as
    // settlementStateOf above.
    const alreadyPaidIds = await Transaction.distinct('investment', {
        user: req.user._id,
        type: 'investor_payout',
    });

    const maturing = await Investment.find({
        investor: req.user.id,
        status: 'matched',
        payoutPaid: null,
        _id: { $nin: alreadyPaidIds.filter(Boolean) },
    }).populate('matchedOrder', 'orderStatus deliveredAt orderItems');

    let maturingTotal = 0;
    const maturingUnits = [];

    for (const investment of maturing) {
        const { payoutPaid } = settlePayout(investment);
        maturingTotal += payoutPaid;

        const line = investment.matchedOrder?.orderItems?.find(
            (item) => String(item.product) === String(investment.product)
        );
        maturingUnits.push({
            investment: investment._id,
            product: investment.product,
            amountInvested: investment.amountInvested,
            pendingPayout: payoutPaid,
            maturesAt: line?.maturesAt ?? null,
            orderStatus: investment.matchedOrder?.orderStatus ?? null,
        });
    }

    totals.maturing = Number(maturingTotal.toFixed(2));
    // The profit half of it, which is what will actually hit `earnings`.
    totals.maturingProfit = Number(
        maturingUnits
            .reduce((sum, u) => sum + (u.pendingPayout - u.amountInvested), 0)
            .toFixed(2)
    );

    res.status(200).json({
        success: true,
        totals,
        transactions: rows,
        maturingUnits: maturingUnits.sort(
            (a, b) => new Date(a.maturesAt ?? 8.64e15) - new Date(b.maturesAt ?? 8.64e15)
        ),
    });
});
