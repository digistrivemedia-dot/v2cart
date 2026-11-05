/**
 * End-to-end check for Phase 21 — return windows gating settlement.
 *
 * The unit self-checks in utils/returnPolicy.js and utils/settlement.js cover
 * the dates and the guards with no database. This covers the thing they cannot:
 * that money actually moves, moves ONCE, and moves at the right moment, through
 * the real models.
 *
 * Runs a throwaway vendor + investor + customer through five scenarios and
 * cleans up after itself.
 *
 *   node scripts/returnWindow.check.js
 */
const mongoose = require('mongoose');
const assert = require('assert');
require('dotenv').config({ path: './config/config.env' });

const User = require('../models/userModel');
const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const Wallet = require('../models/walletModel');
const WalletTransaction = require('../models/walletTransactionModel');
const PlatformSettings = require('../models/platformSettingsModel');
const Category = require('../models/categoryModel');

const { stampMaturity, settleOrderItems, matureDue, repoolItem } = require('../utils/settlement');
const { DAY_MS } = require('../utils/returnPolicy');
const { creditTopup } = require('../utils/wallet');

const TAG = 'p21check';
const round2 = (n) => Number(Number(n).toFixed(2));

const created = { users: [], products: [], orders: [], categories: [] };

async function makeFixtures({ returnPolicy, returnWindowDays, listPrice = 120, marginPct = 20 }) {
    const stamp = `${TAG}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const [category] = await Category.create([{ name: `${stamp}-cat`, slug: `${stamp}-cat` }]);
    created.categories.push(category._id);

    const vendor = await User.create({
        name: `${stamp}-vendor`, email: `${stamp}-vendor@test.local`,
        password: 'test1234', role: 'vendor',
    });
    const investor = await User.create({
        name: `${stamp}-investor`, email: `${stamp}-investor@test.local`,
        password: 'test1234', role: 'investor',
    });
    const customer = await User.create({
        name: `${stamp}-customer`, email: `${stamp}-customer@test.local`,
        password: 'test1234', role: 'user',
    });
    created.users.push(vendor._id, investor._id, customer._id);

    // Priced exactly as the real flow prices: the margin is carved out of the
    // listing price, and the investor pays the vendor's net.
    const vendorPrice = round2(listPrice / (1 + marginPct / 100));
    const product = await Product.create({
        name: `${stamp}-product`, description: 'phase 21 check',
        price: listPrice, vendorPrice, investorPrice: vendorPrice, investorPayout: listPrice,
        marginPct, stock: 10, category: category._id, user: vendor._id,
        listingStatus: 'live', pricingStatus: 'priced',
        returnPolicy, returnWindowDays,
        images: [{ public_id: 'x', url: 'http://x/y.png' }],
    });
    created.products.push(product._id);

    return { vendor, investor, customer, product, vendorPrice };
}

/**
 * An investor funds one unit, exactly as investmentController does.
 *
 * `heldDays` backdates `createdAt`, NOT `matchedAt`. The band is measured as
 * `matchedAt - createdAt`, so ageing the wrong end of that subtraction gives a
 * negative hold that clamps to the fastest band — which silently turns every
 * band assertion into an assertion about 0 days.
 */
async function fundOneUnit(investor, product, bands, { heldDays = 0 } = {}) {
    await creditTopup(investor._id, 1000, `${TAG}-topup-${investor._id}`);
    const investment = await Investment.create({
        investor: investor._id,
        product: product._id,
        amountInvested: product.investorPrice,
        expectedPayout: round2(product.investorPrice * 1.05),
        marginBands: bands,
        createdAt: new Date(Date.now() - heldDays * DAY_MS),
    });
    return investment;
}

/** The sale half of the flow: match the unit, snapshot the policy. */
async function placeOrder(customer, product) {
    const order = await Order.create({
        shippingInfo: {
            address: 'a', city: 'b', state: 'c', country: 'IN',
            pincode: 123456, phoneNo: 9999999999,
        },
        orderItems: [{
            name: product.name, price: product.price, quantity: 1,
            image: 'http://x/y.png', product: product._id,
            returnPolicy: product.returnPolicy || 'full',
            returnWindowDays: product.returnWindowDays ?? 7,
        }],
        user: customer._id,
        paymentInfo: { id: `${TAG}-pay-${Date.now()}`, status: 'captured' },
        paidAt: new Date(),
        totalPrice: product.price,
        orderStatus: 'Confirmed',
    });
    created.orders.push(order._id);

    const matched = await Investment.findOneAndUpdate(
        { product: product._id, status: 'unmatched' },
        // The sale is happening NOW; how long the unit was held comes from the
        // investment's backdated createdAt.
        { status: 'matched', matchedOrder: order._id, matchedAt: new Date() },
        { sort: { createdAt: 1 }, new: true }
    );
    if (matched) {
        order.orderItems[0].matchedInvestments = [matched._id];
        await order.save({ validateBeforeSave: false });
    }

    return { order, matched };
}

const ledger = (orderId, type) =>
    Transaction.aggregate([
        { $match: { order: new mongoose.Types.ObjectId(String(orderId)), type } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]).then((r) => r[0] || { total: 0, count: 0 });

const bucketOf = async (userId) => {
    const w = await Wallet.findOne({ user: userId });
    return { capital: round2(w?.capital || 0), earnings: round2(w?.earnings || 0) };
};

async function run() {
    const settings = await PlatformSettings.getSingleton();
    const bands = settings.defaultMarginBands?.low?.pct != null
        ? settings.defaultMarginBands.toObject?.() ?? settings.defaultMarginBands
        : { low: { days: 10, pct: 5 }, medium: { days: 15, pct: 10 }, high: { days: 90, pct: 15 } };

    // ── 1. A sale pays NOBODY until the window closes ────────────────────
    {
        const f = await makeFixtures({ returnPolicy: 'full', returnWindowDays: 7 });
        const investment = await fundOneUnit(f.investor, f.product, bands, { heldDays: 8 });
        const before = await bucketOf(f.investor._id);

        const { order } = await placeOrder(f.customer, f.product);

        // The sale itself books nothing.
        assert.strictEqual((await ledger(order._id, 'vendor_earning')).count, 0,
            'a sale must not pay the vendor');
        assert.strictEqual((await ledger(order._id, 'investor_payout')).count, 0,
            'a sale must not pay the investor');
        assert.deepStrictEqual(await bucketOf(f.investor._id), before,
            'the investor wallet must not move on a sale');

        // Delivery starts the clock but still pays nothing.
        order.deliveredAt = new Date();
        const dueNow = stampMaturity(order, order.deliveredAt);
        await order.save({ validateBeforeSave: false });
        assert.strictEqual(dueNow.length, 0, 'a refundable line is not due at delivery');
        assert.ok(order.orderItems[0].maturesAt > order.deliveredAt);
        assert.strictEqual((await ledger(order._id, 'vendor_earning')).count, 0);

        // Nothing is due yet, so a cron run now changes nothing.
        await matureDue(new Date());
        assert.strictEqual((await ledger(order._id, 'investor_payout')).count, 0,
            'maturation must not pay early');

        // Wind the window back so it has closed, then mature.
        order.orderItems[0].maturesAt = new Date(Date.now() - DAY_MS);
        await order.save({ validateBeforeSave: false });
        await matureDue(new Date());

        const vendorRow = await ledger(order._id, 'vendor_earning');
        const investorRow = await ledger(order._id, 'investor_payout');
        const platformRow = await ledger(order._id, 'platform_profit');

        assert.strictEqual(round2(vendorRow.total), 100, 'vendor nets 100');
        assert.strictEqual(round2(investorRow.total), 105, 'the 8-day band pays 105, not 110');
        assert.strictEqual(round2(platformRow.total), 15, 'the platform keeps 15');

        const after = await bucketOf(f.investor._id);
        assert.strictEqual(round2(after.capital - before.capital), 100, 'principal returned');
        assert.strictEqual(round2(after.earnings - before.earnings), 5, 'only profit in earnings');

        const settled = await Investment.findById(investment._id);
        assert.strictEqual(settled.payoutPaid, 105);
        assert.strictEqual(settled.payoutPct, 5);

        // ── 2. Running maturation again pays nothing more ────────────────
        await matureDue(new Date());
        await matureDue(new Date());
        assert.strictEqual(
            round2((await ledger(order._id, 'investor_payout')).total), 105,
            'a second cron run must not pay twice'
        );
        assert.deepStrictEqual(await bucketOf(f.investor._id), after,
            'the wallet must be untouched by a repeat run'
        );
        console.log('  ok  1+2  held until the window closed, then paid once');
    }

    // ── 3. A not-refundable product pays at delivery ─────────────────────
    for (const policy of ['none', 'replacement_only']) {
        const f = await makeFixtures({ returnPolicy: policy, returnWindowDays: 0 });
        await fundOneUnit(f.investor, f.product, bands, { heldDays: 12 });
        const before = await bucketOf(f.investor._id);

        const { order } = await placeOrder(f.customer, f.product);
        order.deliveredAt = new Date();
        const dueNow = stampMaturity(order, order.deliveredAt);
        await order.save({ validateBeforeSave: false });

        assert.strictEqual(dueNow.length, 1, `${policy} is due at delivery`);
        await settleOrderItems(order, dueNow);

        assert.strictEqual(round2((await ledger(order._id, 'vendor_earning')).total), 100);
        // 12 days held is the medium band: 10%.
        assert.strictEqual(round2((await ledger(order._id, 'investor_payout')).total), 110);
        assert.strictEqual(round2((await ledger(order._id, 'platform_profit')).total), 10);

        const after = await bucketOf(f.investor._id);
        assert.strictEqual(round2(after.earnings - before.earnings), 10);
        console.log(`  ok  3    ${policy} settled at delivery`);
    }

    // ── 4. A return pays nobody and re-pools the unit ────────────────────
    {
        const f = await makeFixtures({ returnPolicy: 'full', returnWindowDays: 7 });
        const investment = await fundOneUnit(f.investor, f.product, bands, { heldDays: 40 });
        const before = await bucketOf(f.investor._id);

        const { order } = await placeOrder(f.customer, f.product);
        order.deliveredAt = new Date();
        stampMaturity(order, order.deliveredAt);
        await order.save({ validateBeforeSave: false });

        await repoolItem(order, order.orderItems[0], { reason: 'returned', markReturned: true });
        order.orderStatus = 'Returned';
        await order.save({ validateBeforeSave: false });

        const repooled = await Investment.findById(investment._id);
        assert.strictEqual(repooled.status, 'unmatched', 'the unit goes back in the pool');
        assert.strictEqual(repooled.matchedAt, null);
        assert.strictEqual(repooled.payoutPaid, null, 'a returned sale has earned nothing');
        assert.deepStrictEqual(await bucketOf(f.investor._id), before,
            'a return must not move the investor wallet'
        );

        // And the big one: maturation can never pay a returned line, however
        // many times it runs.
        await matureDue(new Date(Date.now() + 30 * DAY_MS));
        assert.strictEqual((await ledger(order._id, 'investor_payout')).count, 0);
        assert.strictEqual((await ledger(order._id, 'vendor_earning')).count, 0);

        // The investor is paid on the NEXT sale of that product, per the user's
        // rule — and the longer hold can land them in a better band.
        const resale = await placeOrder(f.customer, f.product);
        assert.ok(resale.matched, 'the re-pooled unit is matched again');
        assert.strictEqual(String(resale.matched._id), String(investment._id));

        resale.order.deliveredAt = new Date();
        stampMaturity(resale.order, resale.order.deliveredAt);
        resale.order.orderItems[0].maturesAt = new Date(Date.now() - DAY_MS);
        await resale.order.save({ validateBeforeSave: false });
        await matureDue(new Date());

        // 40 days held is the high band: 15%.
        assert.strictEqual(round2((await ledger(resale.order._id, 'investor_payout')).total), 115);
        const afterResale = await bucketOf(f.investor._id);
        assert.strictEqual(round2(afterResale.earnings - before.earnings), 15);
        console.log('  ok  4    a return paid nobody; the re-pooled unit paid on resale');
    }

    // ── 6. An order already settled by the PRE-Phase-21 code ────────────
    //
    // Orders in flight at deploy time were paid at placement by the old
    // settleOrder. They carry ledger rows but no `settledAt`, because the field
    // did not exist — so marking one Delivered must not pay everyone a second
    // time.
    {
        const f = await makeFixtures({ returnPolicy: 'full', returnWindowDays: 7 });
        const investment = await fundOneUnit(f.investor, f.product, bands, { heldDays: 8 });
        const { order, matched } = await placeOrder(f.customer, f.product);

        // Replay exactly what the old code left behind: the money already paid.
        await Transaction.insertMany([
            { type: 'vendor_earning', user: f.vendor._id, product: f.product._id, order: order._id, amount: 100 },
            { type: 'investor_payout', user: f.investor._id, product: f.product._id, order: order._id, investment: matched._id, amount: 105 },
            { type: 'platform_profit', product: f.product._id, order: order._id, investment: matched._id, amount: 15 },
        ]);
        matched.payoutPaid = 105;
        matched.payoutPct = 5;
        await matched.save({ validateBeforeSave: false });
        const { creditSale } = require('../utils/wallet');
        await creditSale(f.investor._id, { principal: 100, payout: 105 },
            { investment: matched._id, product: f.product._id, order: order._id });

        const afterLegacy = await bucketOf(f.investor._id);

        // Now admin marks it delivered, as they would the day after deploying.
        order.deliveredAt = new Date();
        stampMaturity(order, order.deliveredAt);
        order.orderItems[0].maturesAt = new Date(Date.now() - DAY_MS);
        await order.save({ validateBeforeSave: false });
        await matureDue(new Date());

        assert.strictEqual(
            round2((await ledger(order._id, 'investor_payout')).total), 105,
            'a pre-Phase-21 order must not pay the investor twice'
        );
        assert.strictEqual(
            round2((await ledger(order._id, 'vendor_earning')).total), 100,
            'a pre-Phase-21 order must not pay the vendor twice'
        );
        assert.deepStrictEqual(await bucketOf(f.investor._id), afterLegacy,
            'a pre-Phase-21 order must not credit the wallet twice');
        console.log('  ok  6    an already-settled legacy order was not paid twice');
        void investment;
    }

    // ── 5. Two products, two windows, one order ──────────────────────────
    {
        const fast = await makeFixtures({ returnPolicy: 'full', returnWindowDays: 3 });
        const slow = await makeFixtures({ returnPolicy: 'full', returnWindowDays: 7 });

        const order = await Order.create({
            shippingInfo: {
                address: 'a', city: 'b', state: 'c', country: 'IN',
                pincode: 123456, phoneNo: 9999999999,
            },
            orderItems: [
                {
                    name: fast.product.name, price: 120, quantity: 1, image: 'http://x/y.png',
                    product: fast.product._id, returnPolicy: 'full', returnWindowDays: 3,
                },
                {
                    name: slow.product.name, price: 120, quantity: 1, image: 'http://x/y.png',
                    product: slow.product._id, returnPolicy: 'full', returnWindowDays: 7,
                },
            ],
            user: fast.customer._id,
            paymentInfo: { id: `${TAG}-pay-mixed-${Date.now()}`, status: 'captured' },
            paidAt: new Date(), totalPrice: 240, orderStatus: 'Confirmed',
        });
        created.orders.push(order._id);

        const delivered = new Date();
        stampMaturity(order, delivered);
        const gap = (order.orderItems[1].maturesAt - order.orderItems[0].maturesAt) / DAY_MS;
        assert.strictEqual(Math.round(gap), 4, 'the 3-day line matures 4 days before the 7-day one');

        // Four days on, only the 3-day line is due.
        const fourDaysOn = new Date(delivered.getTime() + 4 * DAY_MS);
        order.deliveredAt = delivered;
        await order.save({ validateBeforeSave: false });
        await matureDue(fourDaysOn);

        const reloaded = await Order.findById(order._id);
        assert.ok(reloaded.orderItems[0].settledAt, 'the 3-day line settled');
        assert.strictEqual(reloaded.orderItems[1].settledAt, null, 'the 7-day line has not');
        console.log('  ok  5    mixed-window order matured line by line');
    }
}

async function cleanup() {
    const orders = created.orders;
    await Transaction.deleteMany({ order: { $in: orders } });
    await WalletTransaction.deleteMany({ user: { $in: created.users } });
    await Wallet.deleteMany({ user: { $in: created.users } });
    await Investment.deleteMany({ product: { $in: created.products } });
    await Order.deleteMany({ _id: { $in: orders } });
    await Product.deleteMany({ _id: { $in: created.products } });
    await User.deleteMany({ _id: { $in: created.users } });
    await Category.deleteMany({ _id: { $in: created.categories } });
}

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    try {
        await run();
        console.log('\nreturnWindow: all checks passed');
    } catch (err) {
        console.error('\nreturnWindow: FAILED\n', err);
        process.exitCode = 1;
    } finally {
        await cleanup();
        await mongoose.disconnect();
    }
})();
