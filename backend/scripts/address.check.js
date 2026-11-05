/**
 * Saved addresses — the customer address book behind checkout prefill.
 *
 * The backend CRUD predates this check (see .gemini/address-api-fix.md); what
 * was missing was checkout ever WRITING to it, so a customer retyped their
 * address every order even though the picker could already select a saved one.
 *
 * Two halves here:
 *
 *   1. the CRUD contract — add, list, update, delete, set-default, and the
 *      auto-default on the first address, which is what makes the NEXT
 *      checkout prefill without the customer choosing anything.
 *   2. the EXACT payload CheckoutForm.persistAddress() posts, so a field name
 *      or a string-vs-number mismatch fails here rather than at a real
 *      checkout after the customer has already paid.
 *
 * Needs the server running.
 *
 *   npm start                          (in another shell)
 *   node scripts/address.check.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });

const User = require('../models/userModel');

const API = 'http://localhost:4000/api/v1';
const TAG = `addr${Date.now().toString(36)}`;

let pass = 0;
const failures = [];

const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { failures.push(`${name} ${extra}`); console.log(`  FAIL ${name} ${extra}`); }
};

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

const BASE = {
    name: 'Addr Test',
    phoneNo: 9999999999,
    address: '1 First St',
    city: 'Pune',
    state: 'MH',
    country: 'India',
    pincode: 411001,
    addressType: 'home',
};

async function run(made) {
    const email = `${TAG}@test.local`;
    const reg = await call('/register', {
        method: 'POST',
        body: { name: 'Addr Test', email, password: 'test1234' },
    });
    const user = await User.findOne({ email });
    if (user) made.push(user._id);
    const token = reg.json?.token;
    ok('customer registered', !!token, `status ${reg.status}`);
    if (!token) throw new Error('no token');

    // ── CRUD ─────────────────────────────────────────────────────────────
    const add = await call('/me/addresses/new', { method: 'POST', token, body: BASE });
    ok('POST /me/addresses/new', add.ok, `status ${add.status}`);

    let me = await call('/me', { token });
    ok('  readable back on /me', me.json?.user?.addresses?.length === 1,
        String(me.json?.user?.addresses?.length));
    ok('  the FIRST address auto-defaults (this is what makes checkout prefill)',
        me.json?.user?.addresses?.[0]?.isDefault === true,
        String(me.json?.user?.addresses?.[0]?.isDefault));
    const id1 = me.json?.user?.addresses?.[0]?._id;

    const add2 = await call('/me/addresses/new', {
        method: 'POST', token, body: { ...BASE, address: '2 Second St', city: 'Mumbai' },
    });
    ok('a second address is added', add2.ok, `status ${add2.status}`);
    me = await call('/me', { token });
    ok('  both stored', me.json?.user?.addresses?.length === 2);
    ok('  and the second does NOT steal the default',
        me.json?.user?.addresses?.[1]?.isDefault === false);
    const id2 = me.json?.user?.addresses?.[1]?._id;

    ok('PUT /me/addresses/:id/default', (await call(`/me/addresses/${id2}/default`, { method: 'PUT', token })).ok);
    me = await call('/me', { token });
    const defaults = me.json?.user?.addresses?.filter((a) => a.isDefault) || [];
    ok('  exactly one default, and it moved',
        defaults.length === 1 && String(defaults[0]._id) === String(id2),
        JSON.stringify(defaults.map((d) => d._id)));

    ok('PUT /me/addresses/:id', (await call(`/me/addresses/${id1}`, {
        method: 'PUT', token, body: { ...BASE, city: 'Nashik' },
    })).ok);
    me = await call('/me', { token });
    ok('  the edit stuck',
        me.json?.user?.addresses?.find((a) => String(a._id) === String(id1))?.city === 'Nashik');

    ok('DELETE /me/addresses/:id', (await call(`/me/addresses/${id1}`, { method: 'DELETE', token })).ok);
    me = await call('/me', { token });
    ok('  one left', me.json?.user?.addresses?.length === 1);

    ok('an unauthenticated save is refused',
        (await call('/me/addresses/new', { method: 'POST', body: BASE })).status === 401);

    // ── The exact body checkout sends ────────────────────────────────────
    //
    // Mirrors CheckoutForm.persistAddress(): the form has addressLine1 /
    // addressLine2 / landmark, the backend has one `address` field, so the
    // three are flattened into the SAME string the order's shippingInfo uses.
    // That is what makes selecting it next time refill the street line with
    // exactly what was shipped to.
    const form = {
        fullName: 'Rohan Test', phoneNo: '9876543210',
        addressLine1: '12 MG Road', addressLine2: 'Flat 4B', landmark: 'City Mall',
        city: 'Pune', state: 'Maharashtra', pinCode: '411001', addressType: 'home',
    };
    const flattened = `${form.addressLine1}${form.addressLine2 ? ', ' + form.addressLine2 : ''}`
        + `${form.landmark ? ', Near ' + form.landmark : ''}`;

    const posted = await call('/me/addresses/new', {
        method: 'POST', token,
        body: {
            name: form.fullName,
            phoneNo: parseInt(form.phoneNo),
            address: flattened,
            city: form.city,
            state: form.state,
            country: 'India',
            pincode: parseInt(form.pinCode),
            addressType: form.addressType || 'home',
        },
    });
    ok("checkout's exact payload is accepted", posted.ok,
        `status ${posted.status} ${JSON.stringify(posted.json).slice(0, 90)}`);

    me = await call('/me', { token });
    const saved = me.json?.user?.addresses?.find((a) => a.address === flattened);
    ok('  it round-trips byte-for-byte', !!saved, flattened);
    ok('  line 2 and the landmark survive',
        saved?.address?.includes('Flat 4B') && saved?.address?.includes('Near City Mall'));
    ok('  phoneNo is stored as a number', typeof saved?.phoneNo === 'number', typeof saved?.phoneNo);
    ok('  pincode is stored as a number', typeof saved?.pincode === 'number', typeof saved?.pincode);

    // The client-side duplicate guard, run against what the server returned.
    const dup = me.json?.user?.addresses?.some(
        (a) => a.address?.trim().toLowerCase() === flattened.toLowerCase()
            && String(a.pincode) === form.pinCode.trim()
    );
    ok('  a re-save would be caught as a duplicate', dup === true);
}

(async () => {
    const up = await fetch(API.replace('/api/v1', '/')).catch(() => null);
    if (!up) {
        console.error('The server is not answering on :4000 — run `npm start` first.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const made = [];
    try {
        await run(made);
    } catch (err) {
        failures.push(`threw: ${err.message}`);
        console.error('  threw:', err.message);
    } finally {
        await User.deleteMany({ _id: { $in: made } });
        await mongoose.disconnect();
    }

    console.log();
    if (failures.length === 0) {
        console.log(`address: all ${pass} checks passed`);
    } else {
        console.log(`address: ${pass} passed, ${failures.length} FAILED`);
        failures.forEach((f) => console.log(`  - ${f}`));
        process.exitCode = 1;
    }
})();
