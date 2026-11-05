/**
 * HTTP smoke test for the Phase 21 endpoints.
 *
 * Catches the class of mistake a unit check cannot: a route never mounted, a
 * guard applied to the wrong handler, a payload whose shape the UI does not
 * expect. Every assertion here failed at least once during development.
 *
 * Needs the server running on :4000. Creates a throwaway admin and customer
 * and deletes them afterwards.
 *
 *   npm start                            (in another shell)
 *   node scripts/returnWindow.http.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });
const User = require('../models/userModel');

const API = 'http://localhost:4000/api/v1';
const TAG = `p21http-${Date.now()}`;
let pass = 0, fail = 0;

const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const call = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json };
};

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const made = [];

    const mkUser = async (role) => {
        const email = `${TAG}-${role}@test.local`;
        const u = await User.create({ name: `${TAG}-${role}`, email, password: 'test1234', role });
        made.push(u._id);
        const r = await call('/login', { method: 'POST', body: { email, password: 'test1234' } });
        return { user: u, token: r.json?.token, login: r.status };
    };

    try {
        const admin = await mkUser('admin');
        const customer = await mkUser('user');
        // /login answers 201, not 200 — asserting 200 here failed on the real API.
        ok('admin can log in', admin.login === 201 && !!admin.token, `status ${admin.login}`);

        // ── the settlement queue ──
        const q = await call('/admin/settlements/queue', { token: admin.token });
        ok('GET /admin/settlements/queue returns 200', q.status === 200, JSON.stringify(q.json)?.slice(0,120));
        ok('  queue has holding[]', Array.isArray(q.json?.holding));
        ok('  queue has awaitingDeliveryMark[]', Array.isArray(q.json?.awaitingDeliveryMark));
        ok('  queue reports dueNow', typeof q.json?.dueNow === 'number');

        // a customer must not be able to read it
        const qCust = await call('/admin/settlements/queue', { token: customer.token });
        ok('queue refuses a customer', qCust.status === 403, `status ${qCust.status}`);

        // ── the manual release button ──
        const rel = await call('/admin/settlements/mature', { method: 'POST', token: admin.token });
        ok('POST /admin/settlements/mature returns 200', rel.status === 200, JSON.stringify(rel.json)?.slice(0,120));
        ok('  release reports itemsSettled', typeof rel.json?.itemsSettled === 'number');
        const relCust = await call('/admin/settlements/mature', { method: 'POST', token: customer.token });
        ok('release refuses a customer', relCust.status === 403, `status ${relCust.status}`);

        // ── the cron endpoint ──
        const cronNoSecret = await call('/cron/mature-settlements');
        ok('cron refuses with no secret',
            cronNoSecret.status === 401 || cronNoSecret.status === 503,
            `status ${cronNoSecret.status}`);
        const cronBad = await call('/cron/mature-settlements', { headers: { 'x-cron-secret': 'wrong' } });
        ok('cron refuses a wrong secret',
            cronBad.status === 401 || cronBad.status === 503,
            `status ${cronBad.status}`);
        if (process.env.CRON_SECRET) {
            const cronGood = await call('/cron/mature-settlements', {
                headers: { 'x-cron-secret': process.env.CRON_SECRET },
            });
            ok('cron accepts the right secret', cronGood.status === 200, `status ${cronGood.status}`);
        } else {
            console.log('  --   CRON_SECRET unset: endpoint correctly returns 503 (see notes)');
        }

        // ── the default return policy ──
        const pol = await call('/admin/default-return-policy', {
            method: 'PUT', token: admin.token,
            body: { defaultReturnPolicy: 'full', defaultReturnWindowDays: 7 },
        });
        ok('PUT /admin/default-return-policy returns 200', pol.status === 200, JSON.stringify(pol.json)?.slice(0,140));
        ok('  it echoes the saved settings', pol.json?.settings?.defaultReturnWindowDays === 7);

        const polBad = await call('/admin/default-return-policy', {
            method: 'PUT', token: admin.token,
            body: { defaultReturnPolicy: 'none', defaultReturnWindowDays: 7 },
        });
        ok('it rejects a window on a non-refundable policy', polBad.status === 400,
            `status ${polBad.status}`);
        const polCust = await call('/admin/default-return-policy', {
            method: 'PUT', token: customer.token, body: { defaultReturnWindowDays: 3 },
        });
        ok('default policy refuses a customer', polCust.status === 403, `status ${polCust.status}`);

        // ── the refund endpoint is admin-only now ──
        const refundCust = await call('/payment/razorpay/refund', {
            method: 'POST', token: customer.token, body: { payment_id: 'pay_fake' },
        });
        ok('refund endpoint refuses a customer (was open!)', refundCust.status === 403,
            `status ${refundCust.status}`);

        // ── the customer product page carries the policy ──
        const Product = require('../models/productModel');
        const live = await Product.findOne({ listingStatus: 'live' }).select('_id');
        if (live) {
            const p = await call(`/product/${live._id}`);
            ok('GET /product/:id includes returnPolicy', !!p.json?.product?.returnPolicy,
                JSON.stringify(p.json?.product?.returnPolicy));
            ok('  and a human label', typeof p.json?.product?.returnPolicyLabel === 'string',
                p.json?.product?.returnPolicyLabel);
        } else {
            console.log('  --   no live product to check the public payload against');
        }
    } finally {
        await User.deleteMany({ _id: { $in: made } });
        await mongoose.disconnect();
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
