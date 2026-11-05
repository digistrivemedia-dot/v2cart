/**
 * Phase 23 — the seven mandatory fixes, each proven over HTTP.
 *
 * Every one of these was a live defect found by auditing the running app, so
 * each gets an assertion that would have FAILED before the fix:
 *
 *   1  a fabricated payment / wrong amount at checkout is refused
 *   2  a coupon reaches the profit ledger, and cannot exceed the margin
 *   3  a vendor's sale proceeds land in a wallet they can withdraw
 *   4  investable capacity no longer double-counts a sale
 *   5  lowering the margin clamps bands that now exceed it
 *   6  five wrong passwords locks the account
 *   7  a review needs a delivered purchase
 *
 * Needs the server running and PAYMENTS_MOCK=true.
 *
 *   npm start                        (in another shell)
 *   node scripts/phase23.check.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });

const User = require('../models/userModel');
const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const Category = require('../models/categoryModel');
const Coupon = require('../models/couponModel');
const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const Wallet = require('../models/walletModel');
const WalletTransaction = require('../models/walletTransactionModel');
const PlatformSettings = require('../models/platformSettingsModel');

const API = 'http://localhost:4000/api/v1';
const TAG = `p23${Date.now().toString(36)}`;
const DAY_MS = 86_400_000;

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`    ok   ${name}`); }
    else { failures.push(`${name} ${extra}`); console.log(`    FAIL ${name} ${extra}`); }
};
const step = (n) => console.log(`\n  ${n}`);

async function call(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json, ok: res.ok };
}

const made = { users: [], products: [], orders: [], categories: [], coupons: [] };

async function signUp(role, suffix = '') {
    const email = `${TAG}-${role}${suffix}@test.local`;
    await call('/register', { method: 'POST', body: { name: `${TAG} ${role}`, email, password: 'test1234' } });
    const user = await User.findOne({ email });
    if (user) made.users.push(user._id);
    if (role !== 'user') await User.updateOne({ _id: user._id }, { role });
    const login = await call('/login', { method: 'POST', body: { email, password: 'test1234' } });
    return { email, id: user?._id, token: login.json?.token };
}

async function makeProduct({ vendorId, categoryId, name, price = 120, stock = 10 }) {
    const p = await Product.create({
        name, description: 'phase 23', price,
        vendorPrice: Number((price / 1.2).toFixed(2)),
        investorPrice: Number((price / 1.2).toFixed(2)),
        investorPayout: Number((price / 1.2 * 1.05).toFixed(2)),
        marginPct: 20, stock, category: categoryId, user: vendorId,
        listingStatus: 'live', pricingStatus: 'priced',
        returnPolicy: 'full', returnWindowDays: 7,
        images: [{ public_id: 'x', url: 'http://example.test/y.png', isFeatured: true }],
    });
    made.products.push(p._id);
    return p;
}

/** A real mock payment for an exact rupee amount. */
async function gatewayPayment(token, amount) {
    const rp = await call('/payment/razorpay/order', { method: 'POST', token, body: { amount } });
    return rp.json?.mockPayment?.razorpay_payment_id;
}

const orderBody = (product, paymentId, extra = {}) => ({
    shippingInfo: { address: 'a', city: 'b', state: 'c', country: 'IN', pincode: 411001, phoneNo: 9999999999 },
    orderItems: [{ name: product.name, price: product.price, quantity: 1, image: 'http://x/y.png', product: product._id }],
    paymentInfo: { id: paymentId, status: 'captured' },
    ...extra,
});

async function run() {
    step('SETUP');
    const admin = await signUp('admin');
    const vendor = await signUp('vendor');
    const investor = await signUp('investor');
    const customer = await signUp('user');
    ok('roles ready', [admin, vendor, investor, customer].every((u) => u.token));

    await call(`/admin/user/${investor.id}/approve`, {
        method: 'PUT', token: admin.token,
        body: { approvalStatus: 'approved', profileKey: 'investorProfile' },
    });
    const [category] = await Category.create([{ name: `${TAG}-c`, slug: `${TAG}-c` }]);
    made.categories.push(category._id);

    const settings = await PlatformSettings.getSingleton();
    const gst = settings.gstPct ?? 18;
    const ship = settings.shippingFee ?? 200;
    const product = await makeProduct({ vendorId: vendor.id, categoryId: category._id, name: `${TAG} tile` });
    const expected = Number((product.price + product.price * gst / 100 + ship).toFixed(2));

    // ══ 1. CHECKOUT PAYMENT VERIFICATION ═══════════════════════════════
    step('1 — a fabricated or short payment is refused');

    const fabricated = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: orderBody(product, `totally_made_up_${TAG}`, { totalPrice: 1 }),
    });
    ok('a made-up payment id is refused', fabricated.status === 400,
        `status ${fabricated.status} ${fabricated.json?.message?.slice(0, 50)}`);

    const shortPay = await gatewayPayment(customer.token, 1);
    const short = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: orderBody(product, shortPay, { totalPrice: 1 }),
    });
    ok('a real payment for the wrong amount is refused', short.status === 400,
        short.json?.message?.slice(0, 70));

    const goodPay = await gatewayPayment(customer.token, expected);
    const good = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: orderBody(product, goodPay, { totalPrice: 999999 }),
    });
    ok('a correct payment is accepted', good.status === 201, good.json?.message);
    if (good.json?.order?._id) made.orders.push(good.json.order._id);
    ok('  and the SERVER total is stored, not the client\'s 999999',
        good.json?.order?.totalPrice === expected,
        `${good.json?.order?.totalPrice} vs ${expected}`);
    ok('  with the breakdown recorded for an invoice',
        good.json?.order?.taxPrice > 0 && good.json?.order?.shippingPrice === ship
        && good.json?.order?.itemsPrice === product.price,
        JSON.stringify({ i: good.json?.order?.itemsPrice, t: good.json?.order?.taxPrice, s: good.json?.order?.shippingPrice }));

    const replay = await call('/order/new', {
        method: 'POST', token: customer.token, body: orderBody(product, goodPay),
    });
    ok('the same payment cannot be reused', replay.status === 400,
        replay.json?.message?.slice(0, 50));

    const overStock = await gatewayPayment(customer.token, expected * 99);
    const tooMany = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: {
            ...orderBody(product, overStock),
            orderItems: [{ name: product.name, price: product.price, quantity: 9999, image: 'x', product: product._id }],
        },
    });
    ok('ordering more than stock is refused (stock cannot go negative)',
        tooMany.status === 400, tooMany.json?.message?.slice(0, 40));

    const tampered = await gatewayPayment(customer.token, expected);
    const cheap = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: {
            ...orderBody(product, tampered),
            // A tampered line price must not reach the order or the ledger.
            orderItems: [{ name: 'Free Tile', price: 1, quantity: 1, image: 'x', product: product._id }],
        },
    });
    ok('a tampered line price is overwritten from the DB', cheap.status === 201);
    if (cheap.json?.order?._id) made.orders.push(cheap.json.order._id);
    ok('  the order records the real price', cheap.json?.order?.orderItems?.[0]?.price === product.price,
        String(cheap.json?.order?.orderItems?.[0]?.price));
    ok('  and the real name', cheap.json?.order?.orderItems?.[0]?.name === product.name,
        cheap.json?.order?.orderItems?.[0]?.name);

    // ══ 2. COUPONS REACH THE LEDGER, AND ARE CAPPED ════════════════════
    step('2 — a coupon reaches the profit ledger and cannot exceed the margin');

    const coupon = await Coupon.create({
        code: `${TAG.toUpperCase()}20`, discountType: 'fixed', discountValue: 20,
        expiryDate: new Date(Date.now() + 30 * DAY_MS), isActive: true,
        createdBy: admin.id,
    });
    made.coupons.push(coupon._id);

    const discounted = Number(((product.price - 20) * (1 + gst / 100) + ship).toFixed(2));
    const couponPay = await gatewayPayment(customer.token, discounted);
    const couponOrder = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: orderBody(product, couponPay, { couponCode: coupon.code }),
    });
    ok('a coupon order is accepted at the discounted total', couponOrder.status === 201,
        couponOrder.json?.message);
    const cOrderId = couponOrder.json?.order?._id;
    if (cOrderId) made.orders.push(cOrderId);
    ok('  the discount is recorded', couponOrder.json?.order?.discountAmount === 20,
        String(couponOrder.json?.order?.discountAmount));
    ok('  GST is charged on the DISCOUNTED items', couponOrder.json?.order?.taxPrice === 18,
        String(couponOrder.json?.order?.taxPrice));

    // Settle it and read what the platform booked.
    await call(`/admin/order/${cOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Shipped' } });
    await call(`/admin/order/${cOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Delivered' } });
    const o = await Order.findById(cOrderId);
    for (const it of o.orderItems) if (it.maturesAt) it.maturesAt = new Date(Date.now() - DAY_MS);
    await o.save({ validateBeforeSave: false });
    await call('/admin/settlements/mature', { method: 'POST', token: admin.token });

    const profit = await Transaction.aggregate([
        { $match: { order: new mongoose.Types.ObjectId(String(cOrderId)), type: 'platform_profit' } },
        { $group: { _id: null, t: { $sum: '$amount' } } },
    ]);
    // Collected 100 ex-GST, vendor nets 100 -> the platform keeps 0, not 20.
    ok('platform profit reflects the discount (0, not 20)', profit[0]?.t === 0,
        String(profit[0]?.t));

    const vendorPaid = await Transaction.aggregate([
        { $match: { order: new mongoose.Types.ObjectId(String(cOrderId)), type: 'vendor_earning' } },
        { $group: { _id: null, t: { $sum: '$amount' } } },
    ]);
    ok('  and the vendor is still paid in full', vendorPaid[0]?.t === 100, String(vendorPaid[0]?.t));

    // A coupon larger than the margin is refused rather than sold at a loss.
    const bigCoupon = await Coupon.create({
        code: `${TAG.toUpperCase()}BIG`, discountType: 'percentage', discountValue: 90,
        expiryDate: new Date(Date.now() + 30 * DAY_MS), isActive: true, createdBy: admin.id,
    });
    made.coupons.push(bigCoupon._id);
    const bigPay = await gatewayPayment(customer.token, expected);
    const bigOrder = await call('/order/new', {
        method: 'POST', token: customer.token,
        body: orderBody(product, bigPay, { couponCode: bigCoupon.code }),
    });
    if (bigOrder.json?.order?._id) made.orders.push(bigOrder.json.order._id);
    ok('a 90% coupon is capped at the margin, not honoured in full',
        bigOrder.status !== 201 || bigOrder.json?.order?.discountAmount <= 20,
        `status ${bigOrder.status} discount ${bigOrder.json?.order?.discountAmount}`);

    // ══ 2b. ONE AUTHORITY FOR THE TOTAL ═══════════════════════════════
    step('2b — the quote the client charges is the total the order verifies');

    const q = await call('/order/quote', {
        method: 'POST', token: customer.token,
        body: { items: [{ product: String(product._id), quantity: 1 }] },
    });
    ok('GET a quote for a cart', q.status === 200, `status ${q.status}`);
    ok('  it matches what /order/new will verify', q.json?.quote?.total === expected,
        `${q.json?.quote?.total} vs ${expected}`);
    ok('  with the full breakdown', q.json?.quote?.itemsPrice === product.price
        && q.json?.quote?.shippingPrice === ship, JSON.stringify(q.json?.quote));

    // Paying exactly the quote must succeed — this is the round trip the
    // checkout actually performs.
    const quotedPay = await gatewayPayment(customer.token, q.json.quote.total);
    const quoted = await call('/order/new', {
        method: 'POST', token: customer.token, body: orderBody(product, quotedPay),
    });
    ok('paying the quoted total is accepted', quoted.status === 201, quoted.json?.message);
    if (quoted.json?.order?._id) made.orders.push(quoted.json.order._id);

    // And a quote WITH a coupon is capped the same way the order is, so the
    // two can never disagree.
    //
    // Fresh coupons and a fresh customer: the ones above have been consumed,
    // and a one-use-per-customer coupon is correctly refused the second time —
    // which is behaviour to keep, not to work around.
    const quoteCustomer = await signUp('user', '-quote');
    const qc = await Coupon.create({
        code: `${TAG.toUpperCase()}Q20`, discountType: 'fixed', discountValue: 20,
        expiryDate: new Date(Date.now() + 30 * DAY_MS), isActive: true, createdBy: admin.id,
    });
    made.coupons.push(qc._id);

    const qCoupon = await call('/order/quote', {
        method: 'POST', token: quoteCustomer.token,
        body: { items: [{ product: String(product._id), quantity: 1 }], couponCode: qc.code },
    });
    ok('a coupon quote applies the discount', qCoupon.json?.quote?.discountAmount === 20,
        String(qCoupon.json?.quote?.discountAmount));
    const qCouponPay = await gatewayPayment(quoteCustomer.token, qCoupon.json.quote.total);
    const qCouponOrder = await call('/order/new', {
        method: 'POST', token: quoteCustomer.token,
        body: orderBody(product, qCouponPay, { couponCode: qc.code }),
    });
    ok('  and paying it is accepted', qCouponOrder.status === 201, qCouponOrder.json?.message);
    if (qCouponOrder.json?.order?._id) made.orders.push(qCouponOrder.json.order._id);

    // The coupon validator must agree with the quote, or the displayed total
    // and the charged total diverge.
    const validateCustomer = await signUp('user', '-validate');
    const vcCoupon = await Coupon.create({
        code: `${TAG.toUpperCase()}V20`, discountType: 'fixed', discountValue: 20,
        expiryDate: new Date(Date.now() + 30 * DAY_MS), isActive: true, createdBy: admin.id,
    });
    made.coupons.push(vcCoupon._id);

    const vc = await call('/validate', {
        method: 'POST', token: validateCustomer.token,
        body: { code: vcCoupon.code, items: [{ product: String(product._id), quantity: 1 }] },
    });
    ok('the coupon validator agrees with the quote',
        vc.json?.coupon?.finalAmount === qCoupon.json?.quote?.total,
        `${vc.json?.coupon?.finalAmount} vs ${qCoupon.json?.quote?.total}`);

    const vcBigCoupon = await Coupon.create({
        code: `${TAG.toUpperCase()}VBIG`, discountType: 'percentage', discountValue: 90,
        expiryDate: new Date(Date.now() + 30 * DAY_MS), isActive: true, createdBy: admin.id,
    });
    made.coupons.push(vcBigCoupon._id);

    const vcBig = await call('/validate', {
        method: 'POST', token: validateCustomer.token,
        body: { code: vcBigCoupon.code, items: [{ product: String(product._id), quantity: 1 }] },
    });
    ok('  and reports when a coupon was capped', vcBig.json?.coupon?.capped === true,
        JSON.stringify({ capped: vcBig.json?.coupon?.capped, d: vcBig.json?.coupon?.discount }));

    const reuse = await call('/order/quote', {
        method: 'POST', token: quoteCustomer.token,
        body: { items: [{ product: String(product._id), quantity: 1 }], couponCode: qc.code },
    });
    ok('a coupon already used by that customer is refused in the quote',
        !!reuse.json?.couponError, reuse.json?.couponError);

    // ══ 3. VENDOR PAYOUT RAIL ══════════════════════════════════════════
    step('3 — the vendor has a wallet and can withdraw');

    const vWallet = await call('/wallet', { token: vendor.token });
    ok('a vendor can read their wallet', vWallet.status === 200, `status ${vWallet.status}`);
    ok('  and the matured sale credited it', (vWallet.json?.wallet?.earnings ?? 0) >= 100,
        String(vWallet.json?.wallet?.earnings));
    ok('  withdrawable matches', (vWallet.json?.wallet?.withdrawable ?? 0) >= 100,
        String(vWallet.json?.wallet?.withdrawable));

    const noBank = await call('/withdrawals', { method: 'POST', token: vendor.token, body: { amount: 100 } });
    ok('withdrawing with no bank details is refused by the VENDOR profile',
        noBank.status === 400 && /vendor profile/i.test(noBank.json?.message || ''),
        noBank.json?.message?.slice(0, 70));

    const vStatement = await call('/wallet/statement', { token: vendor.token });
    ok('a vendor can read their statement', vStatement.status === 200);

    const vTopup = await call('/wallet/topup/order', { method: 'POST', token: vendor.token, body: { amount: 100 } });
    ok('but a vendor cannot top up (nothing to deploy into)', vTopup.status === 403,
        `status ${vTopup.status}`);

    const custWallet = await call('/wallet', { token: customer.token });
    ok('a customer still has no wallet', custWallet.status === 403, `status ${custWallet.status}`);

    // ══ 4. INVESTABLE CAPACITY ═════════════════════════════════════════
    step('4 — capacity counts units on hand, not every investment ever made');

    const capProduct = await makeProduct({
        vendorId: vendor.id, categoryId: category._id, name: `${TAG} cap`, stock: 4,
    });
    await call('/wallet/topup/order', { method: 'POST', token: investor.token, body: { amount: 2000 } })
        .then(async (r) => call('/wallet/topup/verify', { method: 'POST', token: investor.token, body: r.json.mockPayment }));

    const fund = await call('/investor/invest', {
        method: 'POST', token: investor.token,
        body: { items: [{ productId: String(capProduct._id), quantity: 2 }] },
    });
    ok('2 of 4 units funded', fund.status === 201, fund.json?.message);

    // Sell one. Stock 4 -> 3, one investment matched.
    const capTotal = Number((capProduct.price * (1 + gst / 100) + ship).toFixed(2));
    const capPay = await gatewayPayment(customer.token, capTotal);
    const capOrder = await call('/order/new', {
        method: 'POST', token: customer.token, body: orderBody(capProduct, capPay),
    });
    if (capOrder.json?.order?._id) made.orders.push(capOrder.json.order._id);

    // Before the fix: lifetime 2 against stock 3 -> 1 left. After: 1 unmatched
    // against stock 3 -> 2 left. The sold unit freed its slot with its stock.
    const listing = await call('/investor/products', { token: investor.token });
    const card = listing.json?.products?.find((p) => String(p._id) === String(capProduct._id));
    ok('a sold unit frees its slot', card?.remainingInvestableUnits === 2,
        `remaining ${card?.remainingInvestableUnits} (stock ${card?.stock}, funded ${card?.investedUnits})`);

    const topUp = await call('/investor/invest', {
        method: 'POST', token: investor.token,
        body: { items: [{ productId: String(capProduct._id), quantity: 2 }] },
    });
    ok('  and both remaining units can be funded', topUp.status === 201, topUp.json?.message);

    const overCap = await call('/investor/invest', {
        method: 'POST', token: investor.token,
        body: { items: [{ productId: String(capProduct._id), quantity: 1 }] },
    });
    ok('  but not one more than stock', overCap.status === 400, overCap.json?.message?.slice(0, 50));

    // ══ 5. MARGIN CLAMP ════════════════════════════════════════════════
    step('5 — lowering the margin clamps bands that now exceed it');

    const banded = await makeProduct({
        vendorId: vendor.id, categoryId: category._id, name: `${TAG} banded`,
    });
    await Product.updateOne({ _id: banded._id }, {
        marginPct: null,
        marginBands: { low: { days: 10, pct: 5 }, medium: { days: 15, pct: 10 }, high: { days: 90, pct: 15 } },
    });

    const originalMargin = settings.marginPct;
    const lowered = await call('/admin/pricing-settings', {
        method: 'PUT', token: admin.token, body: { marginPct: 8, gstPct: gst },
    });
    ok('the margin can still be lowered', lowered.status === 200, lowered.json?.message?.slice(0, 60));

    const afterClamp = await Product.findById(banded._id);
    const maxPct = Math.max(
        afterClamp.marginBands.low.pct, afterClamp.marginBands.medium.pct, afterClamp.marginBands.high.pct
    );
    ok('no band now pays more than the 8% margin', maxPct <= 8, `highest band ${maxPct}%`);
    ok('  and the clamp is reported', (lowered.json?.clampedCount ?? 0) >= 1,
        String(lowered.json?.clampedCount));

    // Restore, so the dev DB is left as it was found.
    //
    // The BANDS have to be restored explicitly: clamping is deliberately
    // one-way (the original percentages are gone once overwritten), so raising
    // the margin back does not undo it. Without this the run leaves the
    // platform defaults flattened to 8/8/8 and every later suite that expects
    // 5/10/15 fails — which is exactly how this was found.
    const beforeClamp = {
        low: { days: settings.defaultMarginBands.low.days, pct: settings.defaultMarginBands.low.pct },
        medium: { days: settings.defaultMarginBands.medium.days, pct: settings.defaultMarginBands.medium.pct },
        high: { days: settings.defaultMarginBands.high.days, pct: settings.defaultMarginBands.high.pct },
    };
    await call('/admin/pricing-settings', {
        method: 'PUT', token: admin.token, body: { marginPct: originalMargin, gstPct: gst },
    });
    await call('/admin/default-margin-bands', {
        method: 'PUT', token: admin.token, body: { defaultMarginBands: beforeClamp },
    });

    const restored = await PlatformSettings.findOne();
    ok('  the run restored the platform defaults it clamped',
        restored.defaultMarginBands.high.pct === beforeClamp.high.pct,
        `${restored.defaultMarginBands.high.pct} vs ${beforeClamp.high.pct}`);

    // ══ 6. LOGIN LOCKOUT ═══════════════════════════════════════════════
    step('6 — five wrong passwords locks the account');

    const victim = await signUp('user', '-victim');
    for (let i = 1; i <= 4; i++) {
        const r = await call('/login', { method: 'POST', body: { email: victim.email, password: 'wrong' } });
        ok(`  attempt ${i} refused with 401`, r.status === 401, `status ${r.status}`);
    }
    const fifth = await call('/login', { method: 'POST', body: { email: victim.email, password: 'wrong' } });
    ok('the 5th attempt locks it', fifth.status === 401 || fifth.status === 429, `status ${fifth.status}`);

    const locked = await call('/login', { method: 'POST', body: { email: victim.email, password: 'test1234' } });
    ok('even the CORRECT password is refused while locked', locked.status === 429,
        `status ${locked.status} ${locked.json?.message?.slice(0, 50)}`);

    // Unlock and confirm a good login clears the counter.
    await User.updateOne({ _id: victim.id }, { loginAttempts: 0, lockUntil: null });
    const recovered = await call('/login', { method: 'POST', body: { email: victim.email, password: 'test1234' } });
    ok('  and it works again once unlocked', recovered.status === 201, `status ${recovered.status}`);
    const cleared = await User.findById(victim.id).select('+loginAttempts');
    ok('  a good login resets the counter', (cleared.loginAttempts || 0) === 0,
        String(cleared.loginAttempts));

    // ══ 7. REVIEWS NEED A PURCHASE ═════════════════════════════════════
    step('7 — only a delivered buyer can review');

    const stranger = await signUp('user', '-stranger');
    const fake = await call('/review', {
        method: 'PUT', token: stranger.token,
        body: { rating: 5, comment: 'never bought this', productId: String(product._id) },
    });
    ok('a non-buyer is refused', fake.status === 403, `status ${fake.status} ${fake.json?.message?.slice(0, 50)}`);

    // The coupon order above was delivered, so this customer genuinely bought it.
    const real = await call('/review', {
        method: 'PUT', token: customer.token,
        body: { rating: 5, comment: 'actually bought and received this', productId: String(product._id) },
    });
    ok('a delivered buyer can review', real.status === 200, `status ${real.status} ${real.json?.message?.slice(0, 50)}`);

    // An undelivered order is not enough.
    const undeliveredBuyer = await signUp('user', '-pending');
    const pendPay = await gatewayPayment(undeliveredBuyer.token, expected);
    const pendOrder = await call('/order/new', {
        method: 'POST', token: undeliveredBuyer.token, body: orderBody(product, pendPay),
    });
    if (pendOrder.json?.order?._id) made.orders.push(pendOrder.json.order._id);
    const tooEarly = await call('/review', {
        method: 'PUT', token: undeliveredBuyer.token,
        body: { rating: 1, comment: 'not arrived yet', productId: String(product._id) },
    });
    ok('an undelivered order is not enough', tooEarly.status === 403, `status ${tooEarly.status}`);
}

async function cleanup() {
    const OrderRequest = require('../models/orderRequestModel');
    await OrderRequest.deleteMany({ order: { $in: made.orders } });
    await Transaction.deleteMany({ $or: [{ order: { $in: made.orders } }, { product: { $in: made.products } }] });
    await WalletTransaction.deleteMany({ user: { $in: made.users } });
    await Wallet.deleteMany({ user: { $in: made.users } });
    await Investment.deleteMany({ product: { $in: made.products } });
    await Order.deleteMany({ _id: { $in: made.orders } });
    await Product.deleteMany({ _id: { $in: made.products } });
    await Coupon.deleteMany({ _id: { $in: made.coupons } });
    await User.deleteMany({ _id: { $in: made.users } });
    await Category.deleteMany({ _id: { $in: made.categories } });
}

(async () => {
    const up = await fetch(API.replace('/api/v1', '/')).catch(() => null);
    if (!up) {
        console.error('The server is not answering on :4000 — run `npm start` first.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    try {
        await run();
    } catch (err) {
        failures.push(`threw: ${err.message}`);
        console.error('\n  threw:', err);
    } finally {
        await cleanup();
        await mongoose.disconnect();
    }

    console.log(`\n${'─'.repeat(64)}`);
    if (failures.length === 0) {
        console.log(`phase23: all ${pass} assertions passed`);
    } else {
        console.log(`phase23: ${pass} passed, ${failures.length} FAILED`);
        failures.forEach((f) => console.log(`  - ${f}`));
        process.exitCode = 1;
    }
})();
