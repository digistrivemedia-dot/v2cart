/**
 * The settlement lifecycle — see MARKETPLACE_CONVERSION_PLAN.md Phase 21.
 *
 * Settlement used to be one event. It is now three, because a customer can
 * send the product back and the money has to still be the platform's when they
 * do:
 *
 *   1. SALE        orderController.settleOrder — matches each sold unit to the
 *                  oldest unmatched investment (FIFO) and stops there. No
 *                  ledger rows, no wallet credits. Nobody has earned anything.
 *   2. DELIVERY    stampMaturity() — each line gets `maturesAt`, which is
 *                  `deliveredAt + returnWindowDays` for a refundable product
 *                  and `deliveredAt` itself for one that is not.
 *   3. MATURATION  settleItem() — the window closed with no return, so the
 *                  rows that used to be written at the sale are written now:
 *                  vendor_earning, investor_payout, platform_profit, and the
 *                  wallet credit that splits principal from profit.
 *
 * …and one undo, repoolItem(), for a return.
 *
 * ── Why "pending" needs no new storage ────────────────────────────────────
 *
 * There is no pending ledger row and no third wallet bucket. The ledger stays
 * what it has always been — a record of money that actually moved — so an
 * unpaid sale is exactly "a matched investment on a line with no `settledAt`".
 * That is derivable, which means it cannot go stale.
 *
 * ── The clock that decides the band ───────────────────────────────────────
 *
 * `settlePayout(investment)` measures days held from `createdAt` to
 * `matchedAt` — the SALE, not this maturation. The investor's capital stopped
 * being at risk the moment their unit sold; the return window is a settlement
 * delay, not extra time at risk. Paying it as though it were would push every
 * investor a band higher and silently cost the platform margin on every funded
 * unit, which is what the self-check at the bottom of this file pins down.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────
 *
 * `item.settledAt` is the guard, and it is set inside the same transaction as
 * the rows it describes. A cron that fires twice, overlaps itself, or races the
 * admin's manual button credits once. That is what makes it safe to just run
 * this again whenever anything looks stuck.
 */

const mongoose = require('mongoose');
const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const Product = require('../models/productModel');
const { calculateUnitProfit } = require('./pricingCalculator');
const { settlePayout } = require('./marginBands');
const { creditSale, creditVendorSale } = require('./wallet');
const { resolveReturnPolicy, maturesAt } = require('./returnPolicy');

const round2 = (n) => Number(Number(n).toFixed(2));

/**
 * One unit's share of what the customer actually paid for a line, net of any
 * coupon — the figure the platform's profit must be measured against.
 *
 * Falls back to the product's listing price for orders placed before Phase 23
 * stored a breakdown: those have no `itemsPrice`, and with no discount recorded
 * the listing price IS what was collected.
 */
function netUnitPrice(order, item, product) {
    const listed = product?.price ?? item.price ?? 0;
    const quantity = Number(item.quantity) || 0;
    const discount = Number(order.discountAmount) || 0;

    if (discount <= 0 || quantity <= 0) return listed;

    // `itemsPrice` is the pre-discount subtotal of the whole order. Recomputed
    // from the lines when absent, so a part-migrated order still allocates
    // correctly rather than silently crediting the discount to one line.
    const itemsPrice = Number(order.itemsPrice) > 0
        ? Number(order.itemsPrice)
        : (order.orderItems || []).reduce(
            (sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0
        );

    if (!(itemsPrice > 0)) return listed;

    const lineTotal = listed * quantity;
    const share = (lineTotal / itemsPrice) * discount;

    return round2(Math.max(lineTotal - share, 0) / quantity);
}

/**
 * Stamp `maturesAt` on every line of a freshly delivered order.
 *
 * Reads the policy SNAPSHOTTED ON THE LINE at order time, not the product's
 * policy today — admin shortening a window afterwards must not shorten a right
 * the customer already bought.
 *
 * Returns the lines that are due immediately (the not-refundable ones, whose
 * `maturesAt` is the delivery date itself), so the caller can settle them in
 * the same request rather than leaving them for tomorrow's cron.
 */
function stampMaturity(order, deliveredAt = order.deliveredAt || new Date()) {
    const dueNow = [];

    for (const item of order.orderItems) {
        if (item.settledAt || item.returnedAt) continue;

        const policy = {
            policy: item.returnPolicy || 'full',
            windowDays: item.returnWindowDays || 0,
        };

        item.maturesAt = maturesAt(deliveredAt, policy);
        if (item.maturesAt <= new Date(deliveredAt)) dueNow.push(item);
    }

    return dueNow;
}

/**
 * Pay out one order line: the vendor, every investor who funded a unit of it,
 * and the platform.
 *
 * Writes exactly the rows the old inline settlement wrote, with the same
 * amounts — only later. Returns `{ settled: false }` without touching anything
 * if the line is already settled or has been returned.
 *
 * `order` must be a live document; this stamps `item.settledAt` on it but does
 * NOT save it, because the caller owns the transaction (see settleOrderItems).
 */
async function settleItem(order, item, { session } = {}) {
    if (item.settledAt) return { settled: false, reason: 'already settled' };
    if (item.returnedAt) return { settled: false, reason: 'returned' };

    // Orders in flight when Phase 21 deployed were already paid at placement by
    // the old settleOrder, and they carry no `settledAt` because the field did
    // not exist yet. Marking one Delivered would otherwise pay its vendor and
    // its investor a SECOND time.
    //
    // Guarded against the ledger rather than against a migration flag on
    // purpose: the rows are the evidence that money moved, so this holds
    // whether or not anyone remembered to run a backfill. Indexed by
    // { order, product } in transactionModel, so it is one cheap lookup.
    const alreadyPaid = await Transaction.findOne({
        order: order._id,
        product: item.product,
        type: { $in: ['vendor_earning', 'investor_payout', 'platform_profit'] },
    })
        .session(session || null)
        .select('_id');

    if (alreadyPaid) {
        // Stamped so the queue stops listing it and the next run skips it on
        // the cheap check above.
        item.settledAt = new Date();
        return { settled: false, reason: 'settled before Phase 21', legacy: true };
    }

    const product = await Product.findById(item.product).session(session || null);
    if (!product) return { settled: false, reason: 'product missing' };

    const vendorPrice = product.vendorPrice;
    const hasVendorEarning = vendorPrice != null && vendorPrice > 0;

    // What the platform ACTUALLY collected for one unit of this line.
    //
    // Phase 23. This was `product.price`, which ignored any coupon, so a
    // discount was absorbed by nobody and reported by nothing: on a ₹20 coupon
    // against a 20%-margin funded unit the ledger booked a ₹15 profit on a sale
    // that really lost ₹5.
    //
    // The order's own `itemsPrice` and `discountAmount` are used rather than
    // the product's price today, because they are what the customer was
    // charged — and the discount is allocated across the lines in proportion to
    // their value, which is the only way to attribute a whole-order coupon.
    const customerPricePerUnit = netUnitPrice(order, item, product);

    const txns = [];
    const payouts = [];

    // One vendor row per unit, matching the pre-Phase-21 shape exactly so the
    // vendor's income dashboard keeps aggregating the same way.
    if (hasVendorEarning) {
        for (let i = 0; i < item.quantity; i++) {
            txns.push({
                type: 'vendor_earning',
                user: product.user,
                product: product._id,
                order: order._id,
                amount: vendorPrice,
            });
        }
    }

    const matchedIds = item.matchedInvestments || [];
    const investments = matchedIds.length
        ? await Investment.find({ _id: { $in: matchedIds } }).session(session || null)
        : [];

    for (const investment of investments) {
        // Measured from the SALE. See the note at the top of this file.
        const { payoutPaid, payoutPct } = settlePayout(investment);

        investment.payoutPaid = payoutPaid;
        investment.payoutPct = payoutPct;
        await investment.save({ validateBeforeSave: false, session });

        txns.push({
            type: 'investor_payout',
            user: investment.investor,
            product: product._id,
            order: order._id,
            investment: investment._id,
            amount: payoutPaid,
        });
        txns.push({
            type: 'platform_profit',
            product: product._id,
            order: order._id,
            investment: investment._id,
            // The slice of the margin this investor's wait did not earn.
            amount: calculateUnitProfit({
                customerPrice: customerPricePerUnit,
                vendorPrice: hasVendorEarning ? vendorPrice : 0,
                amountInvested: investment.amountInvested,
                payoutPaid,
            }),
        });

        payouts.push({ investment, payoutPaid });
    }

    // Units nobody funded: the platform keeps the whole margin on those.
    const unfunded = Math.max(item.quantity - investments.length, 0);
    for (let i = 0; i < unfunded; i++) {
        txns.push({
            type: 'platform_profit',
            product: product._id,
            order: order._id,
            amount: calculateUnitProfit({
                customerPrice: customerPricePerUnit,
                vendorPrice: hasVendorEarning ? vendorPrice : 0,
            }),
        });
    }

    await Transaction.insertMany(txns, { session });

    // ── the cash side ──
    //
    // Phase 23: the VENDOR is credited here too. Their `vendor_earning` rows
    // were reporting-only until now — there was no vendor wallet and no payout
    // rail, so every vendor was paid by manual bank transfer with nothing
    // recording what had been settled.
    if (hasVendorEarning) {
        await creditVendorSale(
            product.user,
            round2(vendorPrice * item.quantity),
            { product: product._id, order: order._id, quantity: item.quantity },
            { session }
        );
    }

    // The ledger above books the full investor payout; the wallet splits it,
    // returning the principal to `capital` and crediting only the band's cut to
    // `earnings`, so an investor's earnings figure stays pure profit.
    for (const { investment, payoutPaid } of payouts) {
        await creditSale(
            investment.investor,
            { principal: investment.amountInvested, payout: payoutPaid },
            { investment: investment._id, product: product._id, order: order._id },
            { session }
        );
    }

    // Stamped last, inside the same transaction as everything above, so a
    // crash anywhere in here leaves the line unsettled and retryable.
    item.settledAt = new Date();

    return {
        settled: true,
        vendorRows: hasVendorEarning ? item.quantity : 0,
        investorsPaid: payouts.length,
        paidOut: payouts.reduce((sum, p) => sum + p.payoutPaid, 0),
    };
}

/**
 * Settle a set of lines on one order, each in its own transaction.
 *
 * Per line rather than per order on purpose: one line failing (a deleted
 * product, an investor's wallet in a weird state) must not hold up the other
 * lines or the rest of the run. The failed line keeps `settledAt: null` and the
 * next pass picks it up again.
 */
async function settleOrderItems(order, items) {
    const results = [];

    for (const item of items) {
        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                result = await settleItem(order, item, { session });
                // `legacy` stamped `settledAt` without paying anything, and
                // that stamp still has to persist or the next run re-checks
                // the ledger for it forever.
                if (result.settled || result.legacy) {
                    await order.save({ validateBeforeSave: false, session });
                }
            });
            results.push({ product: item.product, ...result });
        } catch (err) {
            results.push({ product: item.product, settled: false, error: err.message });
        } finally {
            await session.endSession();
        }
    }

    return results;
}

/**
 * Pay out everything whose return window has closed.
 *
 * The one entry point behind both triggers — the daily cron and admin's manual
 * "release due payouts" button. Idempotent, so running it twice is free and
 * running it late only delays money rather than losing it.
 */
async function matureDue(now = new Date(), { limit = 500 } = {}) {
    const Order = require('../models/orderModel');
    const OrderRequest = require('../models/orderRequestModel');

    // Phase 22 — an order with a PENDING cancellation or return request does
    // not mature, however overdue it is.
    //
    // Without this hold the window can close while admin is still deciding:
    //
    //   day 6  customer requests a return      money still held, fine
    //   day 7  cron fires, window closed       VENDOR AND INVESTOR GET PAID
    //   day 8  admin approves the return       the money is already gone
    //
    // The refund would then have to claw back from an investor who may have
    // withdrawn it, which is the exact InsufficientFunds failure Phase 21 was
    // built to delete. Deciding the request releases the hold: a rejection lets
    // the next run pay out normally, an approval returns the money instead.
    const heldOrderIds = await OrderRequest.distinct('order', { status: 'pending' });

    const orders = await Order.find({
        orderStatus: { $nin: ['Cancelled', 'Returned'] },
        ...(heldOrderIds.length > 0 ? { _id: { $nin: heldOrderIds } } : {}),
        orderItems: {
            $elemMatch: {
                maturesAt: { $ne: null, $lte: now },
                settledAt: null,
                returnedAt: null,
            },
        },
    }).limit(limit);

    const summary = {
        ordersScanned: orders.length,
        itemsSettled: 0,
        investorsPaid: 0,
        paidOut: 0,
        // Surfaced rather than silent: a request nobody decides freezes a
        // vendor's money, so the count has to be visible somewhere.
        heldByRequest: heldOrderIds.length,
        errors: [],
    };

    for (const order of orders) {
        const due = order.orderItems.filter(
            (item) =>
                item.maturesAt && new Date(item.maturesAt) <= new Date(now)
                && !item.settledAt && !item.returnedAt
        );

        for (const result of await settleOrderItems(order, due)) {
            if (result.settled) {
                summary.itemsSettled++;
                summary.investorsPaid += result.investorsPaid;
                summary.paidOut = Number((summary.paidOut + result.paidOut).toFixed(2));
            } else if (result.error) {
                summary.errors.push({ order: String(order._id), product: String(result.product), error: result.error });
            }
        }
    }

    return summary;
}

/**
 * Undo a match without paying anyone — the return path, and the cancellation
 * path for an unsettled line.
 *
 * This is the whole payoff of deferring settlement. The pre-Phase-21 reversal
 * had to claw money back out of the investor's `earnings`, which threw
 * `InsufficientFunds` if they had already withdrawn it and left the order
 * half-reversed and uncancellable. Nothing was credited here, so there is
 * nothing to take back: the units simply go back in the pool.
 *
 * `payoutPct`/`payoutPaid` are cleared along with the match — this unit has not
 * sold any more, so it has earned nothing, and leaving them set would show a
 * returned sale as realised earnings.
 */
async function repoolItem(order, item, { reason = 'order returned', markReturned = true } = {}) {
    const matchedIds = item.matchedInvestments || [];

    if (matchedIds.length > 0) {
        await Investment.updateMany(
            { _id: { $in: matchedIds } },
            {
                status: 'unmatched',
                matchedOrder: null,
                matchedAt: null,
                payoutPct: null,
                payoutPaid: null,
            }
        );

        // Back in the pool means back on today's terms. An investment made at
        // 120 that was matched, then returned after the vendor dropped to 90,
        // would otherwise sit unmatched owing its holder a 120-era payout on a
        // 90 product, and the next sale would settle at a loss.
        //
        // repriceInvestments is required here rather than at the top of the
        // file: it pulls in the wallet, which pulls in mongoose models, and
        // this module is loaded by the self-check without a database.
        const product = await Product.findById(item.product);
        if (product) {
            const { repriceInvestments } = require('./repriceInvestments');
            await repriceInvestments(product);
        }
    }

    // A return marks the line; a cancellation does not, because `returnedAt`
    // means "the customer sent this back" and a cancelled order was never
    // delivered. Either way `maturesAt` is cleared, so no amount of re-running
    // maturation can pay out a line that has been undone.
    if (markReturned) item.returnedAt = new Date();
    item.maturesAt = null;
    item.matchedInvestments = [];

    return { repooled: matchedIds.length, reason };
}

module.exports = {
    netUnitPrice,
    stampMaturity,
    settleItem,
    settleOrderItems,
    matureDue,
    repoolItem,
};

// Self-check for the parts that need no database: which lines are due when.
// The money arithmetic itself is covered by utils/marginScenarios.test.js and
// utils/pricingCalculator.js; what is new in Phase 21 is the DATE, so that is
// what this pins down.
//
// Run with: node utils/settlement.js
if (require.main === module) {
    const assert = require('assert');
    const { DAY_MS } = require('./returnPolicy');
    const { settlePayout, DEFAULT_MARGIN_BANDS } = require('./marginBands');
    const { calculateUnitProfit } = require('./pricingCalculator');

    const at = (n) => new Date(Date.UTC(2026, 0, 1) + n * DAY_MS);
    const line = (over = {}) => ({
        product: 'p1',
        quantity: 1,
        returnPolicy: 'full',
        returnWindowDays: 7,
        maturesAt: null,
        settledAt: null,
        returnedAt: null,
        matchedInvestments: [],
        ...over,
    });

    // ── stampMaturity: the clock starts at delivery ──────────────────────
    {
        const order = { orderItems: [line()], deliveredAt: at(0) };
        const dueNow = stampMaturity(order, at(0));
        assert.deepStrictEqual(order.orderItems[0].maturesAt, at(7), '7-day window from delivery');
        assert.strictEqual(dueNow.length, 0, 'a refundable line is not due at delivery');
    }

    // Two products, two windows, one order — the reason maturity is per line.
    {
        const order = {
            orderItems: [
                line({ product: 'tile', returnWindowDays: 7 }),
                line({ product: 'sdcard', returnWindowDays: 3 }),
            ],
        };
        stampMaturity(order, at(10));
        assert.deepStrictEqual(order.orderItems[0].maturesAt, at(17));
        assert.deepStrictEqual(order.orderItems[1].maturesAt, at(13));
    }

    // Not refundable: due at delivery, and handed back for same-request settling.
    for (const policy of ['none', 'replacement_only']) {
        const order = { orderItems: [line({ returnPolicy: policy, returnWindowDays: 0 })] };
        const dueNow = stampMaturity(order, at(5));
        assert.deepStrictEqual(order.orderItems[0].maturesAt, at(5), `${policy} matures at delivery`);
        assert.strictEqual(dueNow.length, 1, `${policy} is due immediately`);
    }

    // A 0-day full policy behaves the same way.
    {
        const order = { orderItems: [line({ returnWindowDays: 0 })] };
        assert.strictEqual(stampMaturity(order, at(5)).length, 1);
    }

    // Already settled or already returned lines are left alone, so re-marking
    // an order delivered cannot resurrect or re-date them.
    {
        const order = {
            orderItems: [
                line({ settledAt: at(1), maturesAt: at(1) }),
                line({ returnedAt: at(2) }),
            ],
        };
        stampMaturity(order, at(9));
        assert.deepStrictEqual(order.orderItems[0].maturesAt, at(1), 'settled line keeps its date');
        assert.strictEqual(order.orderItems[1].maturesAt, null, 'returned line gets no date');
    }

    // ── The band is measured from the SALE, not from maturation ──────────
    //
    // The regression this phase could most easily introduce. A unit sold 8 days
    // after it was funded pays the 8-day band (5%) even though the money is
    // handed over 7 days later — if maturation were the clock it would read as
    // 15 days and pay 10%, taking an extra 5% out of the platform's margin on
    // every funded unit.
    {
        const investment = {
            amountInvested: 100,
            marginBands: DEFAULT_MARGIN_BANDS,
            createdAt: at(0),
            matchedAt: at(8),          // sold on day 8
        };
        const settledOn = at(15);      // paid out on day 15, after a 7-day window

        const { payoutPct, payoutPaid } = settlePayout(investment);
        assert.strictEqual(payoutPct, 5, 'the 8-day band, not the 15-day one');
        assert.strictEqual(payoutPaid, 105);

        // Same numbers as a pre-Phase-21 instant settlement: a return window
        // moves the date, never an amount.
        assert.strictEqual(
            calculateUnitProfit({
                customerPrice: 120, vendorPrice: 100, amountInvested: 100, payoutPaid,
            }),
            15,
            'the platform keeps exactly what it kept before Phase 21'
        );

        // Belt and braces: settling against the maturation date really would
        // pay more, which is why settleItem never passes it.
        assert.strictEqual(settlePayout(investment, settledOn).payoutPct, 10);
    }

    // ── Phase 23: a coupon must reach the profit ledger ──────────────────
    //
    // The bug: settlement priced every unit at the product's listing price and
    // ignored `discountAmount`, so the platform's booked profit was overstated
    // by exactly the discount — and on a funded unit a coupon bigger than the
    // remaining margin turned a real loss into a reported profit.
    {
        const product = { price: 120 };
        const line = (q = 1) => ({ price: 120, quantity: q });

        // No coupon: unchanged.
        assert.strictEqual(
            netUnitPrice({ discountAmount: 0, itemsPrice: 120, orderItems: [line()] }, line(), product),
            120
        );

        // A ₹20 coupon on a single ₹120 line: the platform collected 100.
        assert.strictEqual(
            netUnitPrice({ discountAmount: 20, itemsPrice: 120, orderItems: [line()] }, line(), product),
            100
        );
        // ...and that is what turns the fiction into the truth.
        assert.strictEqual(
            calculateUnitProfit({ customerPrice: 100, vendorPrice: 100, amountInvested: 100, payoutPaid: 105 }),
            -5,
            'the real result of a 20 coupon on a funded unit'
        );
        assert.strictEqual(
            calculateUnitProfit({ customerPrice: 120, vendorPrice: 100, amountInvested: 100, payoutPaid: 105 }),
            15,
            'what the ledger used to claim'
        );

        // Allocated by value across lines, not dumped on the first one.
        const mixed = {
            discountAmount: 40,
            itemsPrice: 400,
            orderItems: [{ price: 100, quantity: 1 }, { price: 300, quantity: 1 }],
        };
        assert.strictEqual(netUnitPrice(mixed, { price: 100, quantity: 1 }, { price: 100 }), 90);
        assert.strictEqual(netUnitPrice(mixed, { price: 300, quantity: 1 }, { price: 300 }), 270);

        // Per unit, not per line.
        assert.strictEqual(
            netUnitPrice({ discountAmount: 40, itemsPrice: 480, orderItems: [line(4)] }, line(4), product),
            110
        );

        // Pre-Phase-23 orders carry no breakdown. With no discount recorded the
        // listing price IS what was collected, so they settle exactly as before.
        assert.strictEqual(netUnitPrice({ orderItems: [line()] }, line(), product), 120);
        // And if a discount was recorded without an itemsPrice, it is derived
        // rather than credited entirely to one line.
        assert.strictEqual(
            netUnitPrice({ discountAmount: 20, orderItems: [line()] }, line(), product),
            100
        );

        // A discount that swallows the line cannot push the price negative.
        assert.strictEqual(
            netUnitPrice({ discountAmount: 500, itemsPrice: 120, orderItems: [line()] }, line(), product),
            0
        );
    }

    // ── settleItem refuses to pay twice ──────────────────────────────────
    //
    // The guard is checked before any IO, so these need no database.
    (async () => {
        assert.deepStrictEqual(
            await settleItem({ _id: 'o1', orderItems: [] }, line({ settledAt: at(1) })),
            { settled: false, reason: 'already settled' }
        );
        assert.deepStrictEqual(
            await settleItem({ _id: 'o1', orderItems: [] }, line({ returnedAt: at(1) })),
            { settled: false, reason: 'returned' }
        );

        console.log('settlement: all checks passed');
    })();
}
