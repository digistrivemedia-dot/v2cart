/**
 * Opening balances for investors who earned money before the wallet existed.
 *
 * Units that sold BEFORE this feature shipped only ever wrote business-ledger
 * rows (`investor_payout`), because there was no wallet for the cash to land
 * in. Their holders can see the profit on the portfolio page and have nothing
 * to withdraw. This credits what they are actually owed:
 *
 *   earnings += profit of every unit that has sold
 *   capital  += any price-drop refund whose card transfer FAILED
 *
 * ── Why the principal is NOT credited ──────────────────────────────────────
 *
 * Principal returns to wherever it came from. These units were funded by card,
 * so the wallet never paid for them — crediting their principal into the
 * wallet would hand over money the wallet never put out, on top of goods the
 * investor already paid for by card.
 *
 * Units funded FROM the wallet are different, and `creditSale` in
 * utils/wallet.js does return their principal to capital, because there the
 * wallet is what paid. The rule is the same in both cases; only the source of
 * the money differs.
 *
 * Price-drop refunds ARE credited — all of them, not just the ones flagged
 * `refundFailed`.
 *
 * `refundFailed === false` only means the gateway call did not throw. Under
 * PAYMENTS_MOCK the refund method logs "Pretend refund" and returns success,
 * so that flag says nothing about whether money reached a card. Nothing ever
 * recorded a gateway refund id either, so the data cannot distinguish a
 * delivered refund from a pretended one.
 *
 * Crediting them is the safe direction: refunds now go to the wallet rather
 * than to a card, so there is no second rail that could also pay them, and
 * the alternative is an investor who can see "₹25.00 refunded" on their
 * portfolio and nowhere to withdraw it from.
 *
 * `--refunds=failed` restores the conservative behaviour for an environment
 * where real card refunds genuinely did go out.
 *
 * Units still AWAITING a sale are deliberately skipped — that capital is
 * deployed and that profit is not earned yet, so neither is withdrawable.
 *
 * Idempotent: an investor who already has an `opening_balance` row is left
 * alone, so re-running is safe. Every credit writes its own ledger row, so
 * `scripts/wallet.check.js` still reconciles afterwards.
 *
 *   node scripts/backfillWallets.js --dry-run   show what would change
 *   node scripts/backfillWallets.js             apply it
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });

const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const WalletTransaction = require('../models/walletTransactionModel');
const User = require('../models/userModel');
const { applyMovements, getWallet } = require('../utils/wallet');

const dryRun = process.argv.includes('--dry-run');
// `all` (default) credits every historical refund; `failed` only those the
// gateway rejected. See the note above on why `all` is the right default.
const refundMode = process.argv.includes('--refunds=failed') ? 'failed' : 'all';
const round2 = (n) => Number(Number(n).toFixed(2));

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    const investorIds = await Investment.distinct('investor');
    console.log(
        `${investorIds.length} investor(s) with investments`
        + ` — refunds: ${refundMode}${dryRun ? ' — DRY RUN' : ''}\n`
    );

    let credited = 0;
    let skipped = 0;
    let totalCapital = 0;
    let totalEarnings = 0;

    for (const investorId of investorIds) {
        const user = await User.findById(investorId).select('email');
        const label = user?.email || String(investorId);

        const already = await WalletTransaction.findOne({
            user: investorId,
            type: 'opening_balance',
        });
        if (already) {
            console.log(`  skip  ${label} — already has an opening balance`);
            skipped++;
            continue;
        }

        // Only units that have actually sold. `expectedPayout - amountInvested`
        // is the margin on that unit, which is what belongs in earnings.
        const sold = await Investment.find({ investor: investorId, status: 'matched' });
        const profit = round2(sold.reduce((sum, i) => sum + (i.expectedPayout - i.amountInvested), 0));

        // Every price-drop refund booked against this investor. In `failed`
        // mode, narrowed to the ones the gateway explicitly rejected.
        const refundFilter = { type: 'investor_refund', user: investorId };

        if (refundMode === 'failed') {
            const failedUnits = await Investment.find({
                investor: investorId,
                refundFailed: true,
            }).select('_id');
            refundFilter.investment = { $in: failedUnits.map((f) => f._id) };
        }

        const owedRefundRows = await Transaction.find(refundFilter);
        const owedRefunds = round2(owedRefundRows.reduce((sum, t) => sum + Math.abs(t.amount), 0));

        // Per-unit so each row carries its product, which is what lets the
        // wallet attribute "₹3.33 refunded on ecommerse app" rather than
        // showing an unattributable lump.
        const refundMovements = owedRefundRows.map((row) => ({
            bucket: 'capital',
            type: 'refund',
            amount: round2(Math.abs(row.amount)),
            product: row.product,
            investment: row.investment,
            quantity: 1,
            note: 'Price-drop refund that never reached your card',
        }));

        // Profit is credited per sold unit for the same reason.
        const profitMovements = sold
            .map((unit) => ({
                bucket: 'earnings',
                type: 'opening_balance',
                amount: round2(unit.expectedPayout - unit.amountInvested),
                product: unit.product,
                investment: unit._id,
                quantity: 1,
                note: 'Profit on a unit sold before the wallet existed',
            }))
            .filter((m) => m.amount !== 0);

        if (profit === 0 && owedRefunds === 0) {
            console.log(`  skip  ${label} — nothing earned or owed yet`);
            skipped++;
            continue;
        }

        console.log(
            `  ${dryRun ? 'would ' : ''}credit ${label}: earnings +₹${profit.toFixed(2)} `
            + `(${sold.length} unit(s) sold)`
            + (owedRefunds > 0
                ? `, capital +₹${owedRefunds.toFixed(2)} (${owedRefundRows.length} refund(s))`
                : '')
        );

        if (!dryRun) {
            // `refund` rather than `opening_balance` for the refunds: they ARE
            // price-drop refunds, just delivered through the wallet because the
            // card transfer failed. Typing them correctly is what makes them
            // appear under refunds in the summary.
            await applyMovements(investorId, [...profitMovements, ...refundMovements]);

            const wallet = await getWallet(investorId);
            console.log(
                `        -> capital ₹${wallet.capital.toFixed(2)}, earnings ₹${wallet.earnings.toFixed(2)}`
            );
        }

        credited++;
        totalCapital += owedRefunds;
        totalEarnings += profit;
    }

    console.log(
        `\n${dryRun ? 'Would credit' : 'Credited'} ${credited} investor(s), skipped ${skipped}.`
    );
    console.log(
        `Total: capital ₹${round2(totalCapital).toFixed(2)}, earnings ₹${round2(totalEarnings).toFixed(2)}`
    );
    if (dryRun) console.log('\nNothing was written. Re-run without --dry-run to apply.');

    await mongoose.disconnect();
})().catch((err) => {
    console.error('backfill FAILED:', err.message);
    process.exit(1);
});
