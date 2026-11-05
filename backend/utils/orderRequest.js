/**
 * Cancellation and return requests — see MARKETPLACE_CONVERSION_PLAN.md Phase 22.
 *
 * Every rule about what a customer may ask for, in one place, so the customer
 * UI, the create endpoint and the approval endpoint cannot disagree about it.
 * Pure: no models, no database, so the self-check at the bottom runs anywhere.
 *
 * ── The one question this answers ─────────────────────────────────────────
 *
 * Delivery is what changes the question, so it is what the type keys on:
 *
 *   not delivered  ->  CANCEL   the goods have not arrived; stop the order
 *   delivered      ->  RETURN   the goods are here; send them back
 *
 * Each refuses the other. Cancelling something already in the customer's hands
 * is meaningless, and returning something that never arrived is a cancellation
 * wearing the wrong name.
 *
 * ── Mode follows the product's policy, and is only offered when there is a
 *    genuine choice ────────────────────────────────────────────────────────
 *
 *   full              refund OR replacement  -> the customer picks
 *   replacement_only  replacement            -> no choice; there is one option
 *   none              nothing                -> ineligible, with the reason
 *
 * The policy read here is the one SNAPSHOTTED ON THE ORDER LINE at purchase,
 * never the product's policy today — admin tightening a product afterwards
 * must not retroactively remove a right the customer already bought.
 */

const { canRefund, canReplace, returnWindowState } = require('./returnPolicy');

const REQUEST_TYPES = ['cancel', 'return'];
const REQUEST_MODES = ['refund', 'replacement'];
const REQUEST_STATUSES = ['pending', 'approved', 'rejected'];

/** Statuses from which the order has not reached the customer yet. */
const CANCELLABLE_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped'];

/** Statuses meaning the customer has the goods. `Replaced` counts — they have a unit. */
const RETURNABLE_STATUSES = ['Delivered', 'Replaced'];

const MAX_IMAGES = 5;
const MAX_REASON = 1000;

/** Which request type, if any, this order is open to right now. */
function allowedType(order) {
    if (CANCELLABLE_STATUSES.includes(order.orderStatus)) return 'cancel';
    if (RETURNABLE_STATUSES.includes(order.orderStatus)) return 'return';
    // Cancelled / Returned — already finished one way or the other.
    return null;
}

/**
 * Why an order is closed to requests, phrased for the customer.
 * Null when it is open.
 */
function closedReason(order) {
    if (allowedType(order)) return null;
    if (order.orderStatus === 'Cancelled') return 'This order has already been cancelled';
    if (order.orderStatus === 'Returned') return 'This order has already been returned';
    return `No request can be made on an order that is ${order.orderStatus}`;
}

/** The modes a line's snapshotted policy permits, in the order to show them. */
function modesFor(policy) {
    const modes = [];
    if (canRefund(policy)) modes.push('refund');
    if (canReplace(policy)) modes.push('replacement');
    return modes;
}

/**
 * Whether one order line can be returned, what for, and why not if it cannot.
 *
 * `deliveredAt` comes from the order; the window is measured from it by
 * returnPolicy.returnWindowState, which is the same function the admin-side
 * return uses — so a request can never be accepted for a line admin would then
 * be unable to action.
 */
function itemEligibility(item, deliveredAt, now = Date.now()) {
    if (item.returnedAt) {
        return { eligible: false, modes: [], reason: 'Already returned' };
    }

    const policy = {
        policy: item.returnPolicy || 'full',
        windowDays: item.returnWindowDays || 0,
    };

    const modes = modesFor(policy.policy);
    if (modes.length === 0) {
        return { eligible: false, modes: [], reason: 'This item is not eligible for return or replacement' };
    }

    const state = returnWindowState(policy, deliveredAt, now);
    if (!state.open) {
        return { eligible: false, modes: [], reason: state.reason, closesAt: state.closesAt ?? null };
    }

    return { eligible: true, modes, closesAt: state.closesAt, policy: policy.policy };
}

/**
 * Every line of an order, annotated for the return form.
 *
 * Ineligible lines are RETURNED rather than filtered out, so the customer is
 * told why their memory card cannot come back instead of wondering where it
 * went in the list.
 */
function returnableItems(order, now = Date.now()) {
    return (order.orderItems || []).map((item) => ({
        product: String(item.product),
        name: item.name,
        quantity: item.quantity,
        image: item.image,
        ...itemEligibility(item, order.deliveredAt, now),
    }));
}

/**
 * Validates a submitted request. Returns an error message or null.
 *
 * `openRequest` is any already-pending request on this order — one at a time,
 * so an impatient customer cannot queue five.
 */
function requestError({ order, type, mode, items, reason, images = [], openRequest = null, now = Date.now() }) {
    if (openRequest) {
        return 'You already have a request on this order waiting to be reviewed';
    }

    // A rejection is final: the order is closed to further requests.
    if (order.rejectedRequestExists) {
        return 'Your earlier request on this order was declined, so no further request can be made';
    }

    if (!REQUEST_TYPES.includes(type)) {
        return `Request type must be one of ${REQUEST_TYPES.join(', ')}`;
    }

    const allowed = allowedType(order);
    if (!allowed) return closedReason(order);

    if (type !== allowed) {
        return allowed === 'cancel'
            ? 'This order has not been delivered yet, so it can be cancelled but not returned'
            : 'This order has already been delivered, so it can be returned but not cancelled';
    }

    if (!reason || !String(reason).trim()) {
        return type === 'cancel'
            ? 'Please tell us why you are cancelling'
            : 'Please tell us what is wrong with the item';
    }
    if (String(reason).length > MAX_REASON) {
        return `Please keep the message under ${MAX_REASON} characters`;
    }

    if (type === 'cancel') {
        // Whole order, no mode, no photos. Nothing has been delivered, so
        // there is no item to photograph and no per-line choice to make.
        if (mode) return 'A cancellation has no refund or replacement choice';
        if (images.length > 0) return 'Photos are only needed when returning a delivered item';
        return null;
    }

    // ── a return ──
    if (!Array.isArray(items) || items.length === 0) {
        return 'Select at least one item to return';
    }

    if (images.length > MAX_IMAGES) {
        return `Please attach no more than ${MAX_IMAGES} photos`;
    }

    const eligibility = new Map(
        returnableItems(order, now).map((row) => [row.product, row])
    );

    for (const productId of items) {
        const row = eligibility.get(String(productId));
        if (!row) return 'One of the selected items is not on this order';
        if (!row.eligible) return `${row.name}: ${row.reason}`;
    }

    // The mode has to be one EVERY selected item allows, or the request cannot
    // be actioned as a single decision.
    const selected = items.map((id) => eligibility.get(String(id)));
    const shared = REQUEST_MODES.filter((m) => selected.every((row) => row.modes.includes(m)));

    if (shared.length === 0) {
        return 'The selected items do not allow the same outcome — please request them separately';
    }

    if (!mode) {
        // Only an error when there was a genuine choice to make. One option
        // means the caller may omit it and have it filled in (see resolveMode).
        return shared.length > 1 ? 'Choose whether you want a refund or a replacement' : null;
    }

    if (!REQUEST_MODES.includes(mode)) {
        return `Mode must be one of ${REQUEST_MODES.join(', ')}`;
    }
    if (!shared.includes(mode)) {
        return mode === 'refund'
            ? 'These items are eligible for replacement only, not a refund'
            : 'These items are not eligible for replacement';
    }

    return null;
}

/**
 * The mode a validated return request settles on.
 *
 * When the policy leaves one option the customer is never asked, so the server
 * fills it in — that is what "no choice because there is only one option"
 * means in storage as well as on screen.
 */
function resolveMode({ order, type, mode, items, now = Date.now() }) {
    if (type === 'cancel') return null;
    if (mode) return mode;

    const eligibility = new Map(returnableItems(order, now).map((r) => [r.product, r]));
    const selected = items.map((id) => eligibility.get(String(id))).filter(Boolean);
    const shared = REQUEST_MODES.filter((m) => selected.every((row) => row.modes.includes(m)));

    return shared.length === 1 ? shared[0] : null;
}

/** What approving this request should do to the order. */
function approvalOutcome(request) {
    if (request.type === 'cancel') return 'Cancelled';
    return request.mode === 'replacement' ? 'Replaced' : 'Returned';
}

module.exports = {
    REQUEST_TYPES,
    REQUEST_MODES,
    REQUEST_STATUSES,
    CANCELLABLE_STATUSES,
    RETURNABLE_STATUSES,
    MAX_IMAGES,
    MAX_REASON,
    allowedType,
    closedReason,
    modesFor,
    itemEligibility,
    returnableItems,
    requestError,
    resolveMode,
    approvalOutcome,
};

// Self-check for Phase 22. Run with: node utils/orderRequest.js
if (require.main === module) {
    const assert = require('assert');
    const DAY = 86400000;

    const line = (over = {}) => ({
        product: 'p1', name: 'Tile', quantity: 1, image: 'x',
        returnPolicy: 'full', returnWindowDays: 7,
        returnedAt: null, settledAt: null, maturesAt: null,
        ...over,
    });
    const order = (over = {}) => ({
        orderStatus: 'Delivered',
        deliveredAt: new Date(Date.now() - 2 * DAY),
        orderItems: [line()],
        ...over,
    });

    // ── Which type the order is open to ─────────────────────────────────
    for (const st of ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped']) {
        assert.strictEqual(allowedType({ orderStatus: st }), 'cancel', `${st} -> cancel`);
    }
    assert.strictEqual(allowedType({ orderStatus: 'Delivered' }), 'return');
    // A replaced order is still in the customer's hands, so it can go back.
    assert.strictEqual(allowedType({ orderStatus: 'Replaced' }), 'return');
    assert.strictEqual(allowedType({ orderStatus: 'Cancelled' }), null);
    assert.strictEqual(allowedType({ orderStatus: 'Returned' }), null);

    assert.ok(closedReason({ orderStatus: 'Cancelled' }).includes('already been cancelled'));
    assert.ok(closedReason({ orderStatus: 'Returned' }).includes('already been returned'));
    assert.strictEqual(closedReason({ orderStatus: 'Delivered' }), null);

    // ── Each type refuses the other ─────────────────────────────────────
    assert.ok(
        requestError({ order: order({ orderStatus: 'Shipped' }), type: 'return', items: ['p1'], reason: 'broken' })
            ?.includes('not been delivered')
    );
    assert.ok(
        requestError({ order: order(), type: 'cancel', reason: 'changed my mind' })
            ?.includes('already been delivered')
    );

    // ── A cancel: reason only ───────────────────────────────────────────
    const shipped = order({ orderStatus: 'Confirmed', deliveredAt: null });
    assert.strictEqual(requestError({ order: shipped, type: 'cancel', reason: 'changed my mind' }), null);
    assert.ok(requestError({ order: shipped, type: 'cancel', reason: '' })?.includes('why you are cancelling'));
    assert.ok(requestError({ order: shipped, type: 'cancel', reason: '   ' })?.includes('why you are cancelling'));
    assert.ok(
        requestError({ order: shipped, type: 'cancel', reason: 'x', mode: 'refund' })
            ?.includes('no refund or replacement choice')
    );
    assert.ok(
        requestError({ order: shipped, type: 'cancel', reason: 'x', images: [{ url: 'a' }] })
            ?.includes('only needed when returning')
    );

    // ── Modes by policy ─────────────────────────────────────────────────
    assert.deepStrictEqual(modesFor('full'), ['refund', 'replacement']);
    assert.deepStrictEqual(modesFor('replacement_only'), ['replacement']);
    assert.deepStrictEqual(modesFor('none'), []);

    // ── A return on a `full` item: the choice is required ───────────────
    const ok = { order: order(), type: 'return', items: ['p1'], reason: 'arrived cracked' };
    assert.ok(requestError(ok)?.includes('Choose whether'), 'two options means the customer must pick');
    assert.strictEqual(requestError({ ...ok, mode: 'refund' }), null);
    assert.strictEqual(requestError({ ...ok, mode: 'replacement' }), null);
    assert.ok(requestError({ ...ok, mode: 'store_credit' })?.includes('Mode must be one of'));

    // ── replacement_only: no choice, and refund is refused ──────────────
    // A real window: since Phase 22 a replacement-only product keeps its days
    // (how long the customer has to report a dead unit) even though its money
    // settled at delivery.
    const swapOnly = order({ orderItems: [line({ returnPolicy: 'replacement_only', returnWindowDays: 14 })] });
    assert.strictEqual(
        requestError({ order: swapOnly, type: 'return', items: ['p1'], reason: 'dead on arrival' }),
        null,
        'one option, so the mode may be omitted'
    );
    assert.strictEqual(
        resolveMode({ order: swapOnly, type: 'return', items: ['p1'] }),
        'replacement',
        'and the server fills it in'
    );
    assert.ok(
        requestError({ order: swapOnly, type: 'return', items: ['p1'], reason: 'x', mode: 'refund' })
            ?.includes('replacement only')
    );

    // A replacement-only product with NO window is closed the day after
    // delivery — legal, and now a visible admin choice rather than the silent
    // default it was before Phase 22.
    const swapNoWindow = order({ orderItems: [line({ returnPolicy: 'replacement_only', returnWindowDays: 0 })] });
    assert.ok(
        requestError({ order: swapNoWindow, type: 'return', items: ['p1'], reason: 'x' })
            ?.includes('checked on delivery')
    );

    // ── `none`: ineligible, and said so by name ─────────────────────────
    const sealed = order({ orderItems: [line({ name: 'Memory Card', returnPolicy: 'none', returnWindowDays: 0 })] });
    assert.ok(
        requestError({ order: sealed, type: 'return', items: ['p1'], reason: 'x', mode: 'refund' })
            ?.includes('Memory Card'),
        'the error names the item'
    );
    assert.ok(
        requestError({ order: sealed, type: 'return', items: ['p1'], reason: 'x' })?.includes('not eligible')
    );
    // ...and it is still LISTED, so the customer sees why rather than nothing.
    const sealedRows = returnableItems(sealed);
    assert.strictEqual(sealedRows.length, 1);
    assert.strictEqual(sealedRows[0].eligible, false);
    assert.ok(sealedRows[0].reason.includes('not eligible'));

    // ── The window ──────────────────────────────────────────────────────
    const expired = order({ deliveredAt: new Date(Date.now() - 20 * DAY) });
    assert.ok(
        requestError({ order: expired, type: 'return', items: ['p1'], reason: 'x', mode: 'refund' })
            ?.includes('closed on')
    );
    // The last day is still open.
    const lastDay = order({ deliveredAt: new Date(Date.now() - 7 * DAY + 1000) });
    assert.strictEqual(
        requestError({ order: lastDay, type: 'return', items: ['p1'], reason: 'x', mode: 'refund' }),
        null
    );

    // ── Items ───────────────────────────────────────────────────────────
    assert.ok(requestError({ ...ok, items: [] })?.includes('at least one item'));
    assert.ok(requestError({ ...ok, items: ['nope'], mode: 'refund' })?.includes('not on this order'));
    assert.ok(
        requestError({ order: order({ orderItems: [line(), line({ product: 'p2', returnedAt: new Date() }) ] }),
            type: 'return', items: ['p2'], reason: 'x', mode: 'refund' })
            ?.includes('Already returned')
    );

    // A mixed selection has to share an outcome, or it cannot be one decision.
    const mixed = order({
        orderItems: [
            line({ product: 'p1', name: 'Tile', returnPolicy: 'full' }),
            line({ product: 'p2', name: 'Sensor', returnPolicy: 'replacement_only', returnWindowDays: 14 }),
        ],
    });
    assert.strictEqual(
        requestError({ order: mixed, type: 'return', items: ['p1', 'p2'], reason: 'x', mode: 'replacement' }),
        null,
        'replacement is shared by both'
    );
    assert.ok(
        requestError({ order: mixed, type: 'return', items: ['p1', 'p2'], reason: 'x', mode: 'refund' })
            ?.includes('replacement only'),
        'refund is not'
    );
    assert.strictEqual(
        resolveMode({ order: mixed, type: 'return', items: ['p1', 'p2'] }),
        'replacement',
        'and it is the only shared option, so it needs no asking'
    );
    // Pairing a returnable item with a non-returnable one is refused by name.
    const impossible = order({
        orderItems: [line({ product: 'p1' }), line({ product: 'p2', name: 'RAM', returnPolicy: 'none', returnWindowDays: 0 })],
    });
    assert.ok(
        requestError({ order: impossible, type: 'return', items: ['p1', 'p2'], reason: 'x', mode: 'refund' })
            ?.includes('RAM')
    );

    // ── Photos ──────────────────────────────────────────────────────────
    assert.strictEqual(requestError({ ...ok, mode: 'refund', images: [] }), null, 'photos are optional');
    assert.strictEqual(
        requestError({ ...ok, mode: 'refund', images: Array(MAX_IMAGES).fill({ url: 'a' }) }), null
    );
    assert.ok(
        requestError({ ...ok, mode: 'refund', images: Array(MAX_IMAGES + 1).fill({ url: 'a' }) })
            ?.includes(`no more than ${MAX_IMAGES}`)
    );

    // ── One at a time, and a rejection is final ─────────────────────────
    assert.ok(
        requestError({ ...ok, mode: 'refund', openRequest: { _id: 'r1' } })?.includes('waiting to be reviewed')
    );
    assert.ok(
        requestError({ order: { ...order(), rejectedRequestExists: true }, type: 'return', items: ['p1'], reason: 'x', mode: 'refund' })
            ?.includes('was declined')
    );

    // ── Reason length ───────────────────────────────────────────────────
    assert.ok(requestError({ ...ok, mode: 'refund', reason: 'x'.repeat(MAX_REASON + 1) })?.includes('under'));

    // ── What approval does ──────────────────────────────────────────────
    assert.strictEqual(approvalOutcome({ type: 'cancel' }), 'Cancelled');
    assert.strictEqual(approvalOutcome({ type: 'return', mode: 'refund' }), 'Returned');
    assert.strictEqual(approvalOutcome({ type: 'return', mode: 'replacement' }), 'Replaced');

    console.log('orderRequest: all checks passed');
}
