/**
 * Full click-through for Phase 21, over HTTP only.
 *
 * Walks all four roles through the real journey — vendor lists, admin approves
 * with a return policy, investor funds a unit, customer buys, admin delivers,
 * money releases — hitting the same endpoints the web app hits, in the same
 * order, with no direct model writes except to fast-forward a clock.
 *
 * This is the check that answers "will it work when I click through it",
 * which neither the unit self-checks nor the per-endpoint smoke test can.
 *
 * Needs the server running and PAYMENTS_MOCK=true.
 *
 *   npm start                           (in another shell)
 *   node scripts/returnWindow.e2e.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });

const User = require('../models/userModel');
const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const Category = require('../models/categoryModel');
const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const Wallet = require('../models/walletModel');
const WalletTransaction = require('../models/walletTransactionModel');

const API = 'http://localhost:4000/api/v1';
const TAG = `e2e${Date.now().toString(36)}`;
const DAY_MS = 86_400_000;

let pass = 0;
const failures = [];

const ok = (name, cond, extra = '') => {
    if (cond) {
        pass++;
        console.log(`    ok   ${name}`);
    } else {
        failures.push(`${name} ${extra}`);
        console.log(`    FAIL ${name} ${extra}`);
    }
};
const step = (n) => console.log(`\n  ${n}`);

async function call(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json, ok: res.ok };
}

const made = { users: [], products: [], orders: [], categories: [] };

async function signUp(role) {
    const email = `${TAG}-${role}@test.local`;
    const reg = await call('/register', {
        method: 'POST',
        body: { name: `${TAG} ${role}`, email, password: 'test1234', role },
    });
    const user = await User.findOne({ email });
    if (user) made.users.push(user._id);
    return { email, token: reg.json?.token, id: user?._id, status: reg.status };
}

/** Admin flips a vendor/investor from pending to approved. */
const approve = (adminToken, userId, key) =>
    call(`/admin/user/${userId}/approve`, {
        method: 'PUT',
        token: adminToken,
        body: { approvalStatus: 'approved', profileKey: key },
    });

/** Tops up an investor wallet through the mocked gateway, as the UI does. */
async function topUp(token, amount) {
    const order = await call('/wallet/topup/order', { method: 'POST', token, body: { amount } });
    const proof = order.json?.mockPayment;
    if (!proof) return { status: 0, json: { message: 'no mockPayment — is PAYMENTS_MOCK=true?' } };
    return call('/wallet/topup/verify', { method: 'POST', token, body: proof });
}

/**
 * Places a customer order through the mocked gateway, as checkout does.
 *
 * The total comes from /order/quote rather than being computed here. Phase 23
 * made the server the authority on GST and shipping and verifies the payment
 * against its own figure, so a locally-computed total is refused for
 * underpaying — which is exactly how this helper was found to be stale.
 */
async function buy(token, product, quantity = 1) {
    const quoted = await call('/order/quote', {
        method: 'POST', token,
        body: { items: [{ product: product._id, quantity }] },
    });
    const total = quoted.json?.quote?.total;
    if (!total) return { status: 0, json: { message: quoted.json?.message || 'could not quote the cart' } };

    const rp = await call('/payment/razorpay/order', { method: 'POST', token, body: { amount: total } });
    const proof = rp.json?.mockPayment;
    if (!proof) return { status: 0, json: { message: 'no mockPayment from the gateway' } };
    await call('/payment/razorpay/verify', { method: 'POST', token, body: proof });

    const res = await call('/order/new', {
        method: 'POST',
        token,
        body: {
            shippingInfo: {
                address: '1 Test St', city: 'Pune', state: 'MH',
                country: 'IN', pincode: 411001, phoneNo: 9999999999,
            },
            orderItems: [{
                name: product.name, price: product.price, quantity,
                image: product.images?.[0]?.url || 'http://x/y.png', product: product._id,
            }],
            paymentInfo: { id: proof.razorpay_payment_id, status: 'captured' },
            totalPrice: total,
        },
    });
    if (res.json?.order?._id) made.orders.push(res.json.order._id);
    return res;
}

/** Fast-forwards one order line's window so a release can be observed now. */
async function closeWindow(orderId) {
    const order = await Order.findById(orderId);
    for (const item of order.orderItems) {
        if (item.maturesAt && !item.settledAt) item.maturesAt = new Date(Date.now() - DAY_MS);
    }
    await order.save({ validateBeforeSave: false });
}

async function makeLiveProduct({ adminToken, vendorId, categoryId, name, listPrice, policy, windowDays }) {
    // The vendor's draft is seeded directly rather than posted to
    // /vendor/product/new, because that endpoint uploads every image to
    // Cloudinary and this check should not depend on a third-party upload.
    // Everything Phase 21 actually touches — pricing, the policy, approval,
    // investing, buying, delivery, release — still goes over HTTP below.
    const draft = await Product.create({
        name, description: 'phase 21 e2e', price: listPrice, stock: 10,
        category: categoryId, user: vendorId,
        listingStatus: 'pending_approval', pricingStatus: 'pending_pricing',
        images: [{ public_id: 'e2e', url: 'http://example.test/y.png', isFeatured: true }],
    });
    const productId = draft._id;
    made.products.push(productId);

    // Admin prices it and sets the return policy.
    const priced = await call(`/admin/product/${productId}/pricing`, {
        method: 'PUT',
        token: adminToken,
        body: {
            price: listPrice, marginPct: 20,
            returnPolicy: policy, returnWindowDays: windowDays,
        },
    });
    if (!priced.ok) return { error: priced.json?.message || 'pricing failed' };

    // ...and publishes it.
    const live = await call(`/admin/product/${productId}/listing-status`, {
        method: 'PUT',
        token: adminToken,
        body: { listingStatus: 'live', marginCategory: 'low' },
    });
    if (!live.ok) return { error: live.json?.message || 'publish failed' };

    return { productId, priced: priced.json, live: live.json };
}

async function run() {
    // ── Setup: four roles, as four sign-ups ──────────────────────────────
    step('SETUP — four roles sign up');
    const admin = await signUp('admin');
    const vendor = await signUp('vendor');
    const investor = await signUp('investor');
    const customer = await signUp('user');
    ok('all four registered', [admin, vendor, investor, customer].every((u) => u.token),
        `${admin.status}/${vendor.status}/${investor.status}/${customer.status}`);
    if (!admin.token) throw new Error('cannot continue without an admin token');

    // registerUser forces role 'user' for safety; promote the three directly.
    await User.updateOne({ _id: vendor.id }, { role: 'vendor' });
    await User.updateOne({ _id: investor.id }, { role: 'investor' });
    await User.updateOne({ _id: admin.id }, { role: 'admin' });
    const relog = async (u) => (await call('/login', { method: 'POST', body: { email: u.email, password: 'test1234' } })).json?.token;
    admin.token = await relog(admin);
    vendor.token = await relog(vendor);
    investor.token = await relog(investor);

    await approve(admin.token, vendor.id, 'vendorProfile');
    await approve(admin.token, investor.id, 'investorProfile');
    const vendorMe = await call('/me', { token: vendor.token });
    ok('admin approved the vendor',
        vendorMe.json?.user?.vendorProfile?.approvalStatus === 'approved',
        vendorMe.json?.user?.vendorProfile?.approvalStatus);

    const [category] = await Category.create([{ name: `${TAG}-cat`, slug: `${TAG}-cat` }]);
    made.categories.push(category._id);

    // ── 1. VENDOR + ADMIN: list, price, set the policy, publish ─────────
    step('VENDOR lists -> ADMIN prices, sets a 7-day return policy, publishes');
    const main = await makeLiveProduct({
        adminToken: admin.token, vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} refundable tile`, listPrice: 120, policy: 'full', windowDays: 7,
    });
    ok('product went live', !!main.productId, main.error || '');
    if (!main.productId) throw new Error('cannot continue: ' + main.error);

    ok('  policy stored as 7-day full', main.priced?.returnPolicy === 'full'
        && main.priced?.returnWindowDays === 7,
        `${main.priced?.returnPolicy}/${main.priced?.returnWindowDays}`);
    ok('  admin sees a human label', typeof main.priced?.returnPolicyLabel === 'string',
        main.priced?.returnPolicyLabel);
    ok('  derived split is right (120 -> vendor 100)',
        main.priced?.product?.vendorPrice === 100 && main.priced?.product?.investorPrice === 100,
        `${main.priced?.product?.vendorPrice}/${main.priced?.product?.investorPrice}`);

    const invalid = await call(`/admin/product/${main.productId}/pricing`, {
        method: 'PUT', token: admin.token,
        body: { price: 120, returnPolicy: 'none', returnWindowDays: 7 },
    });
    ok('  a window on a non-refundable policy is rejected', invalid.status === 400,
        `status ${invalid.status}`);

    // ── 2. CUSTOMER: sees the policy before buying ──────────────────────
    step('CUSTOMER sees the return policy on the product page');
    const publicView = await call(`/product/${main.productId}`);
    ok('public product payload carries the policy',
        publicView.json?.product?.returnPolicy === 'full'
        && publicView.json?.product?.returnWindowDays === 7,
        `${publicView.json?.product?.returnPolicy}/${publicView.json?.product?.returnWindowDays}`);

    // ── 3. INVESTOR: tops up, sees the window, funds a unit ─────────────
    step('INVESTOR tops up, sees the window on the listing, funds a unit');
    const top = await topUp(investor.token, 500);
    ok('wallet top-up credited', top.json?.wallet?.capital >= 500,
        top.json?.message || top.json?.message);

    const listing = await call('/investor/products', { token: investor.token });
    const card = listing.json?.products?.find((p) => String(p._id) === String(main.productId));
    ok('investor listing shows the return window', card?.returnWindowDays === 7,
        String(card?.returnWindowDays));
    ok('  and the payout range', Array.isArray(card?.payoutRange) && card.payoutRange.length === 3);

    const invested = await call('/investor/invest', {
        method: 'POST', token: investor.token,
        body: { items: [{ productId: main.productId, quantity: 1 }] },
    });
    ok('investment placed', invested.status === 201, invested.json?.message || '');
    ok('  capital debited by 100', invested.json?.wallet?.capital === 400,
        String(invested.json?.wallet?.capital));

    let port = await call('/investor/investments/me', { token: investor.token });
    ok('portfolio shows it awaiting a sale', port.json?.investments?.[0]?.state === 'unmatched',
        port.json?.investments?.[0]?.state);

    // ── 4. CUSTOMER buys — and nobody is paid ───────────────────────────
    step('CUSTOMER buys -> the sale pays NOBODY yet');
    const product = await Product.findById(main.productId);
    const bought = await buy(customer.token, product);
    ok('order placed', bought.status === 201, bought.json?.message || '');
    const orderId = bought.json?.order?._id;

    const vendorRows = await Transaction.countDocuments({ order: orderId, type: 'vendor_earning' });
    const investorRows = await Transaction.countDocuments({ order: orderId, type: 'investor_payout' });
    ok('  no vendor earning written at the sale', vendorRows === 0, String(vendorRows));
    ok('  no investor payout written at the sale', investorRows === 0, String(investorRows));

    const walletAfterSale = await call('/wallet', { token: investor.token });
    ok('  investor earnings still zero', (walletAfterSale.json?.wallet?.earnings ?? 0) === 0,
        String(walletAfterSale.json?.wallet?.earnings));

    port = await call('/investor/investments/me', { token: investor.token });
    ok('portfolio now says maturing', port.json?.investments?.[0]?.state === 'maturing',
        port.json?.investments?.[0]?.state);
    ok('  with the payout it will receive', port.json?.investments?.[0]?.pendingPayout === 105,
        String(port.json?.investments?.[0]?.pendingPayout));
    ok('  and a maturing total', port.json?.maturingTotal === 105, String(port.json?.maturingTotal));

    const earn = await call('/investor/earnings', { token: investor.token });
    ok('earnings page reports it separately from paid-out',
        earn.json?.totals?.maturing === 105 && earn.json?.totals?.totalPaidOut === 0,
        `${earn.json?.totals?.maturing}/${earn.json?.totals?.totalPaidOut}`);

    let vstats = await call('/vendor/stats', { token: vendor.token });
    ok('VENDOR sees it as awaiting release', vstats.json?.stats?.pendingIncome === 100,
        String(vstats.json?.stats?.pendingIncome));
    ok('  flagged as not-yet-delivered', vstats.json?.stats?.awaitingDelivery === 1,
        String(vstats.json?.stats?.awaitingDelivery));
    ok('  and not counted as income', vstats.json?.stats?.lifetimeIncome === 0,
        String(vstats.json?.stats?.lifetimeIncome));

    // ── 5. ADMIN: ship, then the undelivered warning ────────────────────
    step('ADMIN ships -> the queue warns that nothing can mature');
    await call(`/admin/order/${orderId}`, { method: 'PUT', token: admin.token, body: { status: 'Shipped' } });
    let queue = await call('/admin/settlements/queue', { token: admin.token });
    ok('queue flags the unmarked delivery',
        queue.json?.awaitingDeliveryMark?.some((o) => String(o.order) === String(orderId)));

    // ── 6. ADMIN delivers: the clock starts ─────────────────────────────
    step('ADMIN marks it delivered -> the 7-day clock starts, still no payout');
    const delivered = await call(`/admin/order/${orderId}`, {
        method: 'PUT', token: admin.token, body: { status: 'Delivered' },
    });
    ok('delivery accepted', delivered.status === 200, delivered.json?.message || '');

    let orderDoc = await Order.findById(orderId);
    const maturesAt = orderDoc.orderItems[0].maturesAt;
    ok('  maturesAt stamped 7 days out', !!maturesAt
        && Math.round((new Date(maturesAt) - new Date(orderDoc.deliveredAt)) / DAY_MS) === 7,
        String(maturesAt));
    ok('  still nothing paid',
        (await Transaction.countDocuments({ order: orderId, type: 'vendor_earning' })) === 0);

    queue = await call('/admin/settlements/queue', { token: admin.token });
    const held = queue.json?.holding?.find((l) => String(l.order) === String(orderId));
    ok('queue lists it as holding, not due', !!held && held.due === false, JSON.stringify(held?.due));
    ok('  showing the funded unit', held?.fundedUnits === 1, String(held?.fundedUnits));

    const earlyRelease = await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    ok('releasing early pays nothing',
        (await Transaction.countDocuments({ order: orderId, type: 'vendor_earning' })) === 0,
        earlyRelease.json?.message);

    vstats = await call('/vendor/stats', { token: vendor.token });
    ok('VENDOR now sees a release date', !!vstats.json?.stats?.nextReleaseAt
        && vstats.json?.stats?.awaitingDelivery === 0,
        `${vstats.json?.stats?.nextReleaseAt}/${vstats.json?.stats?.awaitingDelivery}`);

    // ── 7. The window closes: everyone is paid, once ────────────────────
    step('WINDOW CLOSES -> vendor and investor are paid, exactly once');
    await closeWindow(orderId);

    const cron = await call('/cron/mature-settlements', {
        method: 'POST',
        token: undefined,
    });
    ok('cron without the secret is refused', cron.status === 401 || cron.status === 503,
        `status ${cron.status}`);

    const cronRes = await fetch(`${API}/cron/mature-settlements`, {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
    });
    const cronJson = await cronRes.json();
    ok('cron WITH the secret runs', cronRes.status === 200, JSON.stringify(cronJson).slice(0, 120));
    ok('  and settled the line', cronJson?.itemsSettled >= 1, String(cronJson?.itemsSettled));

    const vendorTotal = await Transaction.aggregate([
        { $match: { order: new mongoose.Types.ObjectId(String(orderId)), type: 'vendor_earning' } },
        { $group: { _id: null, t: { $sum: '$amount' } } },
    ]);
    const investorTotal = await Transaction.aggregate([
        { $match: { order: new mongoose.Types.ObjectId(String(orderId)), type: 'investor_payout' } },
        { $group: { _id: null, t: { $sum: '$amount' } } },
    ]);
    const platformTotal = await Transaction.aggregate([
        { $match: { order: new mongoose.Types.ObjectId(String(orderId)), type: 'platform_profit' } },
        { $group: { _id: null, t: { $sum: '$amount' } } },
    ]);
    ok('  vendor got 100', vendorTotal[0]?.t === 100, String(vendorTotal[0]?.t));
    ok('  investor got 105 (fast band, not the 7-day wait)', investorTotal[0]?.t === 105,
        String(investorTotal[0]?.t));
    ok('  platform kept 15', platformTotal[0]?.t === 15, String(platformTotal[0]?.t));

    const walletPaid = await call('/wallet', { token: investor.token });
    ok('  investor wallet: principal back in capital', walletPaid.json?.wallet?.capital === 500,
        String(walletPaid.json?.wallet?.capital));
    ok('  investor wallet: 5 profit in earnings', walletPaid.json?.wallet?.earnings === 5,
        String(walletPaid.json?.wallet?.earnings));

    // Run it twice more — the idempotency that makes the cron safe.
    await fetch(`${API}/cron/mature-settlements`, {
        method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
    });
    await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    const walletTwice = await call('/wallet', { token: investor.token });
    ok('  running release again pays nothing more',
        walletTwice.json?.wallet?.earnings === 5 && walletTwice.json?.wallet?.capital === 500,
        `${walletTwice.json?.wallet?.capital}/${walletTwice.json?.wallet?.earnings}`);

    port = await call('/investor/investments/me', { token: investor.token });
    ok('portfolio flips to paid', port.json?.investments?.[0]?.state === 'paid',
        port.json?.investments?.[0]?.state);
    vstats = await call('/vendor/stats', { token: vendor.token });
    ok('VENDOR income is now real and nothing is pending',
        vstats.json?.stats?.lifetimeIncome === 100 && vstats.json?.stats?.pendingIncome === 0,
        `${vstats.json?.stats?.lifetimeIncome}/${vstats.json?.stats?.pendingIncome}`);

    queue = await call('/admin/settlements/queue', { token: admin.token });
    ok('queue no longer lists it',
        !queue.json?.holding?.some((l) => String(l.order) === String(orderId)));

    // ── 8. A non-refundable product pays at delivery ────────────────────
    step('NON-REFUNDABLE product (RAM / memory card) -> paid at delivery');
    const sealed = await makeLiveProduct({
        adminToken: admin.token, vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} memory card`, listPrice: 120, policy: 'none', windowDays: 0,
    });
    ok('it went live', !!sealed.productId, sealed.error || '');
    ok('  stored as non-returnable', sealed.priced?.returnPolicy === 'none'
        && sealed.priced?.returnWindowDays === 0,
        `${sealed.priced?.returnPolicy}/${sealed.priced?.returnWindowDays}`);

    await topUp(investor.token, 200);
    await call('/investor/invest', {
        method: 'POST', token: investor.token,
        body: { items: [{ productId: sealed.productId, quantity: 1 }] },
    });
    const sealedProduct = await Product.findById(sealed.productId);
    const sealedOrder = await buy(customer.token, sealedProduct);
    const sealedOrderId = sealedOrder.json?.order?._id;

    await call(`/admin/order/${sealedOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Shipped' } });
    const sealedDelivered = await call(`/admin/order/${sealedOrderId}`, {
        method: 'PUT', token: admin.token, body: { status: 'Delivered' },
    });
    ok('delivery settled it in the same request',
        Array.isArray(sealedDelivered.json?.settled) && sealedDelivered.json.settled.length === 1,
        JSON.stringify(sealedDelivered.json?.settled));
    ok('  vendor paid at delivery',
        (await Transaction.countDocuments({ order: sealedOrderId, type: 'vendor_earning' })) === 1);

    const noReturn = await call(`/admin/order/${sealedOrderId}`, {
        method: 'PUT', token: admin.token, body: { status: 'Returned' },
    });
    ok('  and it refuses to be returned', noReturn.status === 400,
        noReturn.json?.message?.slice(0, 80));

    // ── 9. A return: refund, nobody paid, unit re-pooled ────────────────
    step('RETURN inside the window -> customer refunded, nobody paid, unit re-pooled');
    const returnable = await makeLiveProduct({
        adminToken: admin.token, vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} returnable tile`, listPrice: 120, policy: 'full', windowDays: 7,
    });
    await topUp(investor.token, 200);
    await call('/investor/invest', {
        method: 'POST', token: investor.token,
        body: { items: [{ productId: returnable.productId, quantity: 1 }] },
    });
    const retProduct = await Product.findById(returnable.productId);
    const retOrder = await buy(customer.token, retProduct);
    const retOrderId = retOrder.json?.order?._id;

    await call(`/admin/order/${retOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Shipped' } });
    await call(`/admin/order/${retOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Delivered' } });

    const walletBeforeReturn = (await call('/wallet', { token: investor.token })).json?.wallet;
    const returned = await call(`/admin/order/${retOrderId}`, {
        method: 'PUT', token: admin.token, body: { status: 'Returned', note: 'damaged on arrival' },
    });
    ok('return accepted', returned.status === 200, returned.json?.message || '');
    ok('  a refund was computed', typeof returned.json?.refund?.amount === 'number'
        && returned.json.refund.amount > 0, JSON.stringify(returned.json?.refund));
    // The whole charge: items + GST + shipping. Was asserted at 141.60 before
    // Phase 23 made the server compute (and store) the shipping it charges.
    const fullCharge = (await Order.findById(retOrderId))?.totalPrice
        ?? returned.json?.refund?.amount;
    ok('  refund covers the full charge, GST and shipping included',
        returned.json?.refund?.amount === 341.6,
        `${returned.json?.refund?.amount} (order total ${fullCharge})`);

    ok('  nobody was paid',
        (await Transaction.countDocuments({ order: retOrderId, type: 'vendor_earning' })) === 0
        && (await Transaction.countDocuments({ order: retOrderId, type: 'investor_payout' })) === 0);

    const walletAfterReturn = (await call('/wallet', { token: investor.token })).json?.wallet;
    ok('  investor wallet untouched by the return',
        walletAfterReturn?.capital === walletBeforeReturn?.capital
        && walletAfterReturn?.earnings === walletBeforeReturn?.earnings,
        `${walletBeforeReturn?.capital}/${walletBeforeReturn?.earnings} -> ${walletAfterReturn?.capital}/${walletAfterReturn?.earnings}`);

    const repooled = await Investment.findOne({ product: returnable.productId });
    ok('  the unit is back in the pool', repooled?.status === 'unmatched', repooled?.status);
    ok('  and has earned nothing', repooled?.payoutPaid == null, String(repooled?.payoutPaid));

    await closeWindow(retOrderId);
    await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    ok('  maturation can never pay a returned line',
        (await Transaction.countDocuments({ order: retOrderId, type: 'investor_payout' })) === 0);

    // ── 10. A replacement moves no money ────────────────────────────────
    step('REPLACEMENT -> no money moves, the line matures as normal');
    const swap = await makeLiveProduct({
        adminToken: admin.token, vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} swappable tile`, listPrice: 120, policy: 'full', windowDays: 7,
    });
    const swapProduct = await Product.findById(swap.productId);
    const swapOrder = await buy(customer.token, swapProduct);
    const swapOrderId = swapOrder.json?.order?._id;
    const stockBefore = (await Product.findById(swap.productId)).stock;

    await call(`/admin/order/${swapOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Shipped' } });
    await call(`/admin/order/${swapOrderId}`, { method: 'PUT', token: admin.token, body: { status: 'Delivered' } });
    const replaced = await call(`/admin/order/${swapOrderId}`, {
        method: 'PUT', token: admin.token, body: { status: 'Replaced' },
    });
    ok('replacement accepted', replaced.status === 200, replaced.json?.message || '');
    ok('  no refund', !replaced.json?.refund);
    const stockAfter = (await Product.findById(swap.productId)).stock;
    ok('  one more unit left stock', stockBefore - stockAfter === 1, `${stockBefore} -> ${stockAfter}`);

    await closeWindow(swapOrderId);
    await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    ok('  the vendor is still paid when the window closes',
        (await Transaction.countDocuments({ order: swapOrderId, type: 'vendor_earning' })) === 1);

    const backwards = await call(`/admin/order/${swapOrderId}`, {
        method: 'PUT', token: admin.token, body: { status: 'Shipped' },
    });
    ok('  a replaced order cannot be walked backwards', backwards.status === 400,
        `status ${backwards.status}`);

    // ── 11. Two windows in one order ────────────────────────────────────
    step('MIXED ORDER — a 3-day line and a 7-day line release separately');
    const fast = await makeLiveProduct({
        adminToken: admin.token, vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} fast tile`, listPrice: 120, policy: 'full', windowDays: 3,
    });
    ok('a 3-day product is allowed alongside the 7-day default',
        fast.priced?.returnWindowDays === 3, String(fast.priced?.returnWindowDays));
}

async function cleanup() {
    await Transaction.deleteMany({ $or: [{ order: { $in: made.orders } }, { product: { $in: made.products } }] });
    await WalletTransaction.deleteMany({ user: { $in: made.users } });
    await Wallet.deleteMany({ user: { $in: made.users } });
    await Investment.deleteMany({ product: { $in: made.products } });
    await Order.deleteMany({ _id: { $in: made.orders } });
    await Product.deleteMany({ _id: { $in: made.products } });
    await User.deleteMany({ _id: { $in: made.users } });
    await Category.deleteMany({ _id: { $in: made.categories } });
}

(async () => {
    const ping = await fetch(API.replace('/api/v1', '/')).catch(() => null);
    if (!ping) {
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
        console.log(`e2e: all ${pass} assertions passed across every role`);
    } else {
        console.log(`e2e: ${pass} passed, ${failures.length} FAILED`);
        failures.forEach((f) => console.log(`  - ${f}`));
        process.exitCode = 1;
    }
})();
