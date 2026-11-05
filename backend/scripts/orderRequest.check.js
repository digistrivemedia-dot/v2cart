/**
 * End-to-end check for Phase 22 — customer requests, admin decides.
 *
 * Drives the real endpoints: a customer asks to cancel or return, admin
 * approves or rejects, and the money moves (or does not) exactly the Phase 21
 * way. Covers the four things most likely to be wrong:
 *
 *   1. a cancel before delivery / a return after, each refusing the other
 *   2. approval actually moving the money, through the extracted flows
 *   3. a PENDING request freezing maturation — the bug this phase would
 *      otherwise ship, where the window closes mid-decision and the vendor and
 *      investor get paid before the refund is agreed
 *   4. rejection releasing that freeze, and closing the order to re-requests
 *
 * Needs the server running and PAYMENTS_MOCK=true.
 *
 *   npm start                             (in another shell)
 *   node scripts/orderRequest.check.js
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
const OrderRequest = require('../models/orderRequestModel');

const API = 'http://localhost:4000/api/v1';
const TAG = `req${Date.now().toString(36)}`;
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

const made = { users: [], products: [], orders: [], categories: [], requests: [] };

async function signUp(role) {
    const email = `${TAG}-${role}@test.local`;
    const reg = await call('/register', {
        method: 'POST', body: { name: `${TAG} ${role}`, email, password: 'test1234' },
    });
    const user = await User.findOne({ email });
    if (user) made.users.push(user._id);
    if (role !== 'user') await User.updateOne({ _id: user._id }, { role });
    const login = await call('/login', { method: 'POST', body: { email, password: 'test1234' } });
    return { email, id: user?._id, token: login.json?.token };
}

async function makeProduct({ vendorId, categoryId, name, policy, windowDays }) {
    const vendorPrice = Number((120 / 1.2).toFixed(2));
    const p = await Product.create({
        name, description: 'phase 22', price: 120, vendorPrice,
        investorPrice: vendorPrice, investorPayout: 126, marginPct: 20,
        stock: 10, category: categoryId, user: vendorId,
        listingStatus: 'live', pricingStatus: 'priced',
        returnPolicy: policy, returnWindowDays: windowDays,
        images: [{ public_id: 'x', url: 'http://example.test/y.png', isFeatured: true }],
    });
    made.products.push(p._id);
    return p;
}

async function buy(token, product) {
    // Quoted server-side: Phase 23 verifies the payment against the server's
    // own total (GST + shipping), so a locally-computed one underpays.
    const quoted = await call('/order/quote', {
        method: 'POST', token, body: { items: [{ product: product._id, quantity: 1 }] },
    });
    const total = quoted.json?.quote?.total;
    const rp = await call('/payment/razorpay/order', { method: 'POST', token, body: { amount: total } });
    const proof = rp.json?.mockPayment;
    await call('/payment/razorpay/verify', { method: 'POST', token, body: proof });
    const res = await call('/order/new', {
        method: 'POST', token,
        body: {
            shippingInfo: { address: 'a', city: 'b', state: 'c', country: 'IN', pincode: 411001, phoneNo: 9999999999 },
            orderItems: [{ name: product.name, price: product.price, quantity: 1, image: 'http://x/y.png', product: product._id }],
            paymentInfo: { id: proof.razorpay_payment_id, status: 'captured' },
            totalPrice: total,
        },
    });
    if (res.json?.order?._id) made.orders.push(res.json.order._id);
    return res.json?.order;
}

const setStatus = (token, orderId, status) =>
    call(`/admin/order/${orderId}`, { method: 'PUT', token, body: { status } });

const ledger = (orderId, type) =>
    Transaction.countDocuments({ order: orderId, type });

async function closeWindow(orderId) {
    const order = await Order.findById(orderId);
    for (const item of order.orderItems) {
        if (item.maturesAt && !item.settledAt) item.maturesAt = new Date(Date.now() - DAY_MS);
    }
    await order.save({ validateBeforeSave: false });
}

async function run() {
    step('SETUP');
    const admin = await signUp('admin');
    const vendor = await signUp('vendor');
    const investor = await signUp('investor');
    const customer = await signUp('user');
    ok('four roles signed in', [admin, vendor, investor, customer].every((u) => u.token));

    await call(`/admin/user/${investor.id}/approve`, {
        method: 'PUT', token: admin.token,
        body: { approvalStatus: 'approved', profileKey: 'investorProfile' },
    });
    const [category] = await Category.create([{ name: `${TAG}-c`, slug: `${TAG}-c` }]);
    made.categories.push(category._id);

    // ── 1. Before delivery: cancel only ─────────────────────────────────
    step('BEFORE DELIVERY — cancel is offered, return is refused');
    const tile = await makeProduct({
        vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} tile`, policy: 'full', windowDays: 7,
    });
    const order1 = await buy(customer.token, tile);

    let opts = await call(`/order/${order1._id}/request`, { token: customer.token });
    ok('options say cancel', opts.json?.allowedType === 'cancel', opts.json?.allowedType);
    ok('  and a request is allowed', opts.json?.canRequest === true);

    const badReturn = await call(`/order/${order1._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(tile._id)], reason: 'broken', mode: 'refund' },
    });
    ok('a return before delivery is refused', badReturn.status === 400,
        badReturn.json?.message?.slice(0, 60));

    const noReason = await call(`/order/${order1._id}/request`, {
        method: 'POST', token: customer.token, body: { type: 'cancel', reason: '  ' },
    });
    ok('a cancel with no reason is refused', noReason.status === 400);

    const cancelReq = await call(`/order/${order1._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'cancel', reason: 'ordered the wrong size' },
    });
    ok('cancel request created', cancelReq.status === 201, cancelReq.json?.message);
    if (cancelReq.json?.request?._id) made.requests.push(cancelReq.json.request._id);

    const second = await call(`/order/${order1._id}/request`, {
        method: 'POST', token: customer.token, body: { type: 'cancel', reason: 'again' },
    });
    ok('a second request while one is pending is refused', second.status === 400,
        second.json?.message?.slice(0, 50));

    // Another customer must not see or touch it.
    const other = await signUp('user2');
    const peek = await call(`/order/${order1._id}/request`, { token: other.token });
    ok('another customer cannot read this order', peek.status === 404, `status ${peek.status}`);

    // ── 2. Admin approves the cancellation ──────────────────────────────
    step('ADMIN approves the cancellation');
    const queue = await call('/admin/order-requests?status=pending', { token: admin.token });
    ok('it appears in the admin queue',
        queue.json?.requests?.some((r) => String(r._id) === String(cancelReq.json.request._id)));
    ok('  and the order id is flagged for the list badge',
        queue.json?.pendingOrderIds?.includes(String(order1._id)));

    const custQueue = await call('/admin/order-requests', { token: customer.token });
    ok('a customer cannot read the admin queue', custQueue.status === 403, `status ${custQueue.status}`);

    const stockBefore = (await Product.findById(tile._id)).stock;
    const approved = await call(`/admin/order-request/${cancelReq.json.request._id}`, {
        method: 'PUT', token: admin.token, body: { status: 'approved' },
    });
    ok('approval accepted', approved.status === 200, approved.json?.message);
    ok('  the order is Cancelled', approved.json?.order?.orderStatus === 'Cancelled',
        approved.json?.order?.orderStatus);
    const stockAfter = (await Product.findById(tile._id)).stock;
    ok('  stock was restored', stockAfter - stockBefore === 1, `${stockBefore} -> ${stockAfter}`);

    const decideAgain = await call(`/admin/order-request/${cancelReq.json.request._id}`, {
        method: 'PUT', token: admin.token, body: { status: 'rejected', adminNote: 'changed mind' },
    });
    ok('a decided request cannot be decided twice', decideAgain.status === 400,
        decideAgain.json?.message?.slice(0, 50));

    // ── 3. After delivery: return only, with the mode the policy allows ──
    step('AFTER DELIVERY — return only, and the mode follows the policy');
    const order2 = await buy(customer.token, tile);
    await setStatus(admin.token, order2._id, 'Shipped');
    await setStatus(admin.token, order2._id, 'Delivered');

    opts = await call(`/order/${order2._id}/request`, { token: customer.token });
    ok('options say return', opts.json?.allowedType === 'return', opts.json?.allowedType);
    ok('  the item is eligible', opts.json?.items?.[0]?.eligible === true);
    ok('  and offers both modes on a full policy',
        JSON.stringify(opts.json?.items?.[0]?.modes) === JSON.stringify(['refund', 'replacement']),
        JSON.stringify(opts.json?.items?.[0]?.modes));

    const badCancel = await call(`/order/${order2._id}/request`, {
        method: 'POST', token: customer.token, body: { type: 'cancel', reason: 'too late' },
    });
    ok('a cancel after delivery is refused', badCancel.status === 400,
        badCancel.json?.message?.slice(0, 60));

    const noMode = await call(`/order/${order2._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(tile._id)], reason: 'cracked' },
    });
    ok('a full-policy return without a mode is refused', noMode.status === 400,
        noMode.json?.message?.slice(0, 50));

    const tooMany = await call(`/order/${order2._id}/request`, {
        method: 'POST', token: customer.token,
        body: {
            type: 'return', items: [String(tile._id)], reason: 'cracked', mode: 'refund',
            images: Array(6).fill('data:image/png;base64,iVBORw0KGgo='),
        },
    });
    ok('more than 5 photos is refused', tooMany.status === 400, tooMany.json?.message?.slice(0, 50));

    const returnReq = await call(`/order/${order2._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(tile._id)], reason: 'arrived cracked', mode: 'refund' },
    });
    ok('return request created', returnReq.status === 201, returnReq.json?.message);
    if (returnReq.json?.request?._id) made.requests.push(returnReq.json.request._id);

    // ── 4. THE BUG: a pending request must freeze maturation ────────────
    step('PENDING REQUEST freezes the payout — the Phase 22 money bug');
    await closeWindow(order2._id);
    const frozen = await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    ok('the release reports the hold', (frozen.json?.heldByRequest ?? 0) >= 1,
        String(frozen.json?.heldByRequest));
    ok('  the vendor was NOT paid', (await ledger(order2._id, 'vendor_earning')) === 0);
    ok('  the investor was NOT paid', (await ledger(order2._id, 'investor_payout')) === 0);

    const sq = await call('/admin/settlements/queue', { token: admin.token });
    ok('  the queue labels it as awaiting a decision', (sq.json?.awaitingDecision ?? 0) >= 1,
        String(sq.json?.awaitingDecision));
    ok('  and excludes it from "due now"',
        !sq.json?.holding?.find((l) => String(l.order) === String(order2._id) && l.due && !l.heldByRequest));

    // ── 5. Approving the return refunds and pays nobody ─────────────────
    step('ADMIN approves the return');
    const retApproved = await call(`/admin/order-request/${returnReq.json.request._id}`, {
        method: 'PUT', token: admin.token, body: { status: 'approved' },
    });
    ok('approval accepted', retApproved.status === 200, retApproved.json?.message);
    ok('  the order is Returned', retApproved.json?.order?.orderStatus === 'Returned');
    // Items + GST + shipping. Phase 23 made the server compute and store the
    // shipping it charges, so a full return now hands all of it back.
    ok('  the customer was refunded the full charge incl. GST and shipping',
        retApproved.json?.refund?.amount === 341.6,
        String(retApproved.json?.refund?.amount));
    ok('  the vendor was still never paid', (await ledger(order2._id, 'vendor_earning')) === 0);

    await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    ok('  and maturation can never pay it now', (await ledger(order2._id, 'investor_payout')) === 0);

    // ── 6. Rejection: nothing moves, the freeze lifts, no re-request ────
    step('REJECTION — nothing moves, the freeze lifts, and it is final');
    const order3 = await buy(customer.token, tile);
    await setStatus(admin.token, order3._id, 'Shipped');
    await setStatus(admin.token, order3._id, 'Delivered');

    const rejectMe = await call(`/order/${order3._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(tile._id)], reason: 'do not want it', mode: 'refund' },
    });
    if (rejectMe.json?.request?._id) made.requests.push(rejectMe.json.request._id);

    const noNote = await call(`/admin/order-request/${rejectMe.json.request._id}`, {
        method: 'PUT', token: admin.token, body: { status: 'rejected' },
    });
    ok('rejecting without a reason is refused', noNote.status === 400,
        noNote.json?.message?.slice(0, 60));

    await closeWindow(order3._id);
    const rejected = await call(`/admin/order-request/${rejectMe.json.request._id}`, {
        method: 'PUT', token: admin.token,
        body: { status: 'rejected', adminNote: 'Outside our policy — no fault found' },
    });
    ok('rejection accepted', rejected.status === 200, rejected.json?.message);
    ok('  the order is untouched', rejected.json?.order?.orderStatus === 'Delivered',
        rejected.json?.order?.orderStatus);
    ok('  the customer can see the reason',
        rejected.json?.request?.adminNote?.includes('no fault found'));

    const again = await call(`/order/${order3._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(tile._id)], reason: 'please reconsider', mode: 'refund' },
    });
    ok('the customer cannot re-request after a rejection', again.status === 400,
        again.json?.message?.slice(0, 60));

    // The freeze lifted, so the money releases normally now.
    const released = await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
    ok('the rejected order pays out normally', (await ledger(order3._id, 'vendor_earning')) === 1,
        released.json?.message);

    // ── 7. replacement_only: no choice offered, refund refused ──────────
    step('REPLACEMENT-ONLY product — one option, so no choice is offered');
    const sensor = await makeProduct({
        vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} sensor`, policy: 'replacement_only', windowDays: 14,
    });
    const order4 = await buy(customer.token, sensor);
    await setStatus(admin.token, order4._id, 'Shipped');
    await setStatus(admin.token, order4._id, 'Delivered');

    opts = await call(`/order/${order4._id}/request`, { token: customer.token });
    ok('only replacement is offered',
        JSON.stringify(opts.json?.items?.[0]?.modes) === JSON.stringify(['replacement']),
        JSON.stringify(opts.json?.items?.[0]?.modes));
    ok('  and it is eligible 14 days after delivery (the Phase 22 window fix)',
        opts.json?.items?.[0]?.eligible === true, opts.json?.items?.[0]?.reason);

    const wantRefund = await call(`/order/${order4._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(sensor._id)], reason: 'dead', mode: 'refund' },
    });
    ok('asking for a refund on it is refused', wantRefund.status === 400,
        wantRefund.json?.message?.slice(0, 60));

    const swapReq = await call(`/order/${order4._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(sensor._id)], reason: 'dead on arrival' },
    });
    ok('omitting the mode works when there is one option', swapReq.status === 201);
    ok('  and the server filled it in as replacement', swapReq.json?.request?.mode === 'replacement',
        swapReq.json?.request?.mode);
    if (swapReq.json?.request?._id) made.requests.push(swapReq.json.request._id);

    const swapDone = await call(`/admin/order-request/${swapReq.json.request._id}`, {
        method: 'PUT', token: admin.token, body: { status: 'approved' },
    });
    ok('approving it marks the order Replaced', swapDone.json?.order?.orderStatus === 'Replaced',
        swapDone.json?.order?.orderStatus);
    ok('  with no refund', !swapDone.json?.refund);

    // ── 8. A non-returnable product offers nothing ──────────────────────
    step('NON-RETURNABLE product — listed as ineligible, with the reason');
    const ram = await makeProduct({
        vendorId: vendor.id, categoryId: category._id,
        name: `${TAG} RAM`, policy: 'none', windowDays: 0,
    });
    const order5 = await buy(customer.token, ram);
    await setStatus(admin.token, order5._id, 'Shipped');
    await setStatus(admin.token, order5._id, 'Delivered');

    opts = await call(`/order/${order5._id}/request`, { token: customer.token });
    ok('the item is listed but ineligible', opts.json?.items?.[0]?.eligible === false);
    ok('  with a reason the customer can read',
        opts.json?.items?.[0]?.reason?.includes('not eligible'), opts.json?.items?.[0]?.reason);

    const tryRam = await call(`/order/${order5._id}/request`, {
        method: 'POST', token: customer.token,
        body: { type: 'return', items: [String(ram._id)], reason: 'want to send back', mode: 'refund' },
    });
    ok('requesting it is refused by name', tryRam.status === 400,
        tryRam.json?.message?.slice(0, 70));
}

async function cleanup() {
    await OrderRequest.deleteMany({ $or: [{ _id: { $in: made.requests } }, { order: { $in: made.orders } }] });
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
        console.log(`orderRequest e2e: all ${pass} assertions passed`);
    } else {
        console.log(`orderRequest e2e: ${pass} passed, ${failures.length} FAILED`);
        failures.forEach((f) => console.log(`  - ${f}`));
        process.exitCode = 1;
    }
})();
