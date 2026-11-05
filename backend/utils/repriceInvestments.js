const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const { creditRefund } = require('./wallet');
const { isCompleteBands, forecastPayout } = require('./marginBands');

// A sub-rupee drop is just the 2dp rounding residue, and writing a ledger row
// for every paisa of it is noise. Below this the investment stays on its old
// (slightly better) terms — the ≤₹1 cost lands on the platform, never on the
// investor.
//
// This used to exist because Razorpay won't refund less than a rupee. Refunds
// go to the wallet now, which has no such floor, but the threshold is worth
// keeping for the noise reason alone.
const MIN_REFUND = 1;

// Keeps unmatched investments honest when a product's price moves.
//
// A price DROP means the investor paid more than this unit is now worth, so
// the difference is credited to their wallet's capital and the investment's
// terms are rewritten to the new price — the investor ends up exactly where a
// new investor buying today would be.
//
// It goes to the wallet rather than back to a card because the wallet is the
// only rail investor money travels on now. That also removes the old failure
// mode entirely: a card refund could be rejected by the gateway and had to be
// flagged on the investment for someone to chase by hand. A wallet credit is
// a local transaction that either commits or doesn't.
//
// A price RISE leaves existing investors completely alone: their agreed return
// is already intact, raising their payout for free would push the platform
// negative, and charging them the difference needs a card consent flow that
// doesn't exist. Whatever is left over stays with the platform.
//
// Matched investments are never touched — that unit has already sold and the
// money has already moved.
//
// See MARKETPLACE_CONVERSION_PLAN.md Phase 10. Call this after every change to
// a product's price, from whichever role made the change.
async function repriceInvestments(product) {
    if (product.investorPrice == null) return [];

    const investments = await Investment.find({ product: product._id, status: 'unmatched' });
    const refunds = [];

    // Which band the rewritten forecast is quoted against. The product's
    // assigned band is enough — this figure is display only, and the number
    // that actually pays is computed at settlement from the real days held.
    const label = product.marginCategory || 'low';

    for (const investment of investments) {
        const refund = Number((investment.amountInvested - product.investorPrice).toFixed(2));

        if (refund < MIN_REFUND) continue;

        await creditRefund(investment.investor, refund, {
            investment: investment._id,
            product: product._id,
            note: 'product price drop',
        });

        investment.amountInvested = product.investorPrice;
        // The forecast is re-derived from the reduced capital rather than
        // copied off the product, because since Phase 20 the payout IS a
        // percentage of amountInvested — a band's percentage applied to the
        // capital still at risk. The investment keeps its own snapshotted
        // bands, so a reprice changes how much is at risk and never the deal.
        // Legacy investments (no snapshot) keep their contracted payout and are
        // only ever reduced by the refund, same as before.
        if (isCompleteBands(investment.marginBands)) {
            investment.expectedPayout = forecastPayout(
                investment.amountInvested,
                investment.marginBands,
                label
            );
        } else {
            investment.expectedPayout = product.investorPayout;
        }
        // Nothing can fail to arrive any more, so this clears rather than
        // sticking. Rows already flagged by the old card-refund path are left
        // alone — that debt is real and still needs settling by hand.
        await investment.save();

        await Transaction.create({
            type: 'investor_refund',
            user: investment.investor,
            product: product._id,
            investment: investment._id,
            amount: -refund,
        });

        refunds.push({ investment: investment._id, amount: refund, refundFailed: false });
    }

    return refunds;
}

module.exports = { repriceInvestments, MIN_REFUND };
