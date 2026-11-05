/**
 * Return policy — see MARKETPLACE_CONVERSION_PLAN.md Phase 21.
 *
 * Two numbers per product, and the one question they answer: a customer has
 * bought a unit, when does the money stop being refundable and become the
 * vendor's and the investor's?
 *
 *   returnPolicy      full | replacement_only | none
 *   returnWindowDays   how long after DELIVERY the customer may send it back
 *
 * ── Only `full` holds money ────────────────────────────────────────────────
 *
 * The hold exists to protect one thing: cash the platform may have to hand
 * back. So it is keyed on refundability and nothing else.
 *
 *   full              refundable -> HOLD until deliveredAt + windowDays
 *   replacement_only  a swap costs the VENDOR a unit, not the investor their
 *                     payout and not the platform any cash -> settle at delivery
 *   none              nothing to give back at all -> settle at delivery
 *
 * A memory card or a stick of RAM is `none`. Something worth swapping if it
 * arrives dead, but not worth taking back for cash, is `replacement_only`.
 *
 * ── What this file deliberately does NOT know ─────────────────────────────
 *
 * How much anyone is paid. A return window moves only the DATE money moves,
 * never an amount — the band percentage is still computed from `matchedAt` in
 * utils/marginBands.js, because the investor's capital stopped being at risk
 * when the unit sold. The settlement delay is not extra time at risk, and
 * paying it as though it were would push every investor one band higher at the
 * platform's expense.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ordered loosest to strictest, which is also the order admin sees them in. */
const RETURN_POLICIES = ['full', 'replacement_only', 'none'];

/**
 * The fallback when a product sets no policy of its own. Mirrored in
 * platformSettingsModel (`defaultReturnPolicy`, `defaultReturnWindowDays`) so
 * admin can move it; only the shape is relied on here.
 */
const DEFAULT_RETURN_POLICY = 'full';
const DEFAULT_RETURN_WINDOW_DAYS = 7;

/**
 * A window this long or longer is almost certainly a typo (someone typing a
 * date instead of a day count). Nothing breaks above it, but a vendor's money
 * would be held for a year, so it is refused at the edge rather than discovered
 * later.
 */
const MAX_RETURN_WINDOW_DAYS = 180;

/**
 * Which policy applies to a product: its own, else the platform default.
 *
 * `??` rather than `||` throughout, so an explicit 0-day window is honoured
 * instead of falling through to the 7-day default. A 0-day window on a `full`
 * product is legal and means "refundable in principle, but settle at delivery"
 * — admin's way of saying the goods are inspected on receipt.
 */
function resolveReturnPolicy(product, settings) {
    const policy = product?.returnPolicy ?? settings?.defaultReturnPolicy ?? DEFAULT_RETURN_POLICY;
    const windowDays =
        product?.returnWindowDays ?? settings?.defaultReturnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS;

    const resolved = RETURN_POLICIES.includes(policy) ? policy : DEFAULT_RETURN_POLICY;

    return {
        policy: resolved,
        // `none` can never be acted on, so its window is meaningless and is
        // flattened to 0. `replacement_only` KEEPS its window.
        //
        // That distinction was wrong until Phase 22 exposed it. The window was
        // zeroed for everything except `full`, which conflated two questions
        // that only share a number on a refundable product:
        //
        //   how long is the MONEY held?    -> maturesAt(); a non-refundable
        //                                     product settles at delivery
        //                                     regardless of this number
        //   how long may the CUSTOMER act? -> returnWindowState(), which needs
        //                                     real days even when no money moves
        //
        // Zeroed, a replacement-only product became un-swappable the instant it
        // was delivered — which defeats the entire policy.
        windowDays: resolved === 'none' ? 0 : Math.max(Number(windowDays) || 0, 0),
    };
}

/** Whether a sale under this policy must wait before anyone is paid. */
function holdsMoney(policy) {
    return policy === 'full';
}

/** Whether the customer can get their money back. */
function canRefund(policy) {
    return policy === 'full';
}

/** Whether the customer can have the unit swapped. */
function canReplace(policy) {
    return policy === 'full' || policy === 'replacement_only';
}

/**
 * When a delivered unit's money becomes real.
 *
 * Returns the delivery date itself for anything that isn't refundable — there
 * is nothing to wait for, so those settle in the same pass that marks the order
 * delivered.
 */
function maturesAt(deliveredAt, { policy, windowDays }) {
    const delivered = new Date(deliveredAt);
    // `holdsMoney` is checked FIRST and on its own: a replacement-only product
    // can carry a real window (the customer may still report a dead unit) and
    // must still settle at delivery, because there is no refund to protect.
    if (!holdsMoney(policy)) return delivered;
    if (windowDays <= 0) return delivered;
    return new Date(delivered.getTime() + windowDays * DAY_MS);
}

/**
 * When the CUSTOMER's right to act expires.
 *
 * Deliberately not `maturesAt`. The two answer different questions and only
 * coincide on a refundable product:
 *
 *   maturesAt       when the platform releases the money  -> ignores the window
 *                                                            unless refundable
 *   returnClosesAt  when the customer can no longer ask   -> always the window
 *
 * Deriving one from the other is the bug Phase 22 found: a replacement-only
 * product settles at delivery, so reading its deadline off `maturesAt` closed
 * the swap window the instant the parcel arrived.
 */
function returnClosesAt(deliveredAt, windowDays) {
    const delivered = new Date(deliveredAt);
    const days = Math.max(Number(windowDays) || 0, 0);
    return new Date(delivered.getTime() + days * DAY_MS);
}

/**
 * Whether a return is still open on a delivered unit, and why not if it isn't.
 *
 * Takes the resolved policy rather than the product, so the caller decides
 * whether it is asking about the product's rules today or the rules the order
 * was sold under.
 */
function returnWindowState({ policy, windowDays }, deliveredAt, now = Date.now()) {
    if (!deliveredAt) {
        // Not delivered yet. Cancellation is the path for an undelivered order,
        // not a return, and the two settle differently.
        return { open: false, reason: 'This order has not been delivered yet' };
    }
    if (!canRefund(policy) && !canReplace(policy)) {
        return { open: false, reason: 'This product is not eligible for return or replacement' };
    }

    const closesAt = returnClosesAt(deliveredAt, windowDays);
    if (new Date(now) > closesAt) {
        return {
            open: false,
            closesAt,
            reason: windowDays > 0
                ? `The ${windowDays}-day return window closed on ${closesAt.toISOString().slice(0, 10)}`
                : 'This item had to be checked on delivery, and that window has passed',
        };
    }

    return { open: true, closesAt };
}

/**
 * Validates an admin-submitted policy. Returns an error message or null.
 *
 * Both fields are independently optional: `undefined` means "leave what is
 * stored", `null` means "clear it back to the platform default". That is the
 * same tri-state `marginPct` and `investableUnits` already use.
 */
function returnPolicyError({ returnPolicy, returnWindowDays }) {
    if (returnPolicy !== undefined && returnPolicy !== null && returnPolicy !== '') {
        if (!RETURN_POLICIES.includes(returnPolicy)) {
            return `Return policy must be one of ${RETURN_POLICIES.join(', ')}`;
        }
    }

    if (returnWindowDays !== undefined && returnWindowDays !== null && returnWindowDays !== '') {
        const days = Number(returnWindowDays);
        if (!Number.isFinite(days) || days < 0 || !Number.isInteger(days)) {
            return 'The return window must be a whole number of days, 0 or more';
        }
        if (days > MAX_RETURN_WINDOW_DAYS) {
            return `A return window longer than ${MAX_RETURN_WINDOW_DAYS} days holds the vendor's `
                + 'money for too long — check the number is days and not a date';
        }
        // Only `none` is a contradiction: nothing can be asked for, so a
        // number of days to ask within is meaningless. `replacement_only` DOES
        // take a window — it is how long the customer has to report a dead
        // unit, and it never holds any money (see maturesAt).
        if (days > 0 && returnPolicy === 'none') {
            return 'A non-returnable product has no window — set the days to 0, '
                + 'or change the policy to allow a return';
        }
    }

    return null;
}

/** Human-readable, for the admin table and the investor's "waiting until" line. */
function describeReturnPolicy({ policy, windowDays }) {
    if (policy === 'none') return 'No return or replacement';
    if (policy === 'replacement_only') return 'Replacement only, no refund';
    if (windowDays <= 0) return 'Refundable on inspection at delivery';
    return `${windowDays}-day return`;
}

module.exports = {
    DAY_MS,
    RETURN_POLICIES,
    DEFAULT_RETURN_POLICY,
    DEFAULT_RETURN_WINDOW_DAYS,
    MAX_RETURN_WINDOW_DAYS,
    resolveReturnPolicy,
    holdsMoney,
    canRefund,
    canReplace,
    maturesAt,
    returnClosesAt,
    returnWindowState,
    returnPolicyError,
    describeReturnPolicy,
};

// Self-check for MARKETPLACE_CONVERSION_PLAN.md Phase 21.
// Run with: node utils/returnPolicy.js
if (require.main === module) {
    const assert = require('assert');
    const settings = { defaultReturnPolicy: 'full', defaultReturnWindowDays: 7 };
    const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * DAY_MS);

    // ── Resolution: product's own, else the platform default ─────────────
    assert.deepStrictEqual(resolveReturnPolicy({}, settings), { policy: 'full', windowDays: 7 });
    assert.deepStrictEqual(resolveReturnPolicy(null, settings), { policy: 'full', windowDays: 7 });
    assert.deepStrictEqual(
        resolveReturnPolicy({ returnWindowDays: 3 }, settings),
        { policy: 'full', windowDays: 3 }
    );
    // The user's example: one product 7 days, another 3, both from one default.
    assert.strictEqual(resolveReturnPolicy({ returnWindowDays: 7 }, settings).windowDays, 7);
    assert.strictEqual(resolveReturnPolicy({ returnWindowDays: 3 }, settings).windowDays, 3);

    // An explicit 0 is honoured, NOT read as unset — the `??` vs `||` bug.
    assert.strictEqual(resolveReturnPolicy({ returnWindowDays: 0 }, settings).windowDays, 0);

    // `none` has no window, whatever number is stored next to it — nothing can
    // ever be asked for, so days to ask within are meaningless.
    assert.deepStrictEqual(
        resolveReturnPolicy({ returnPolicy: 'none', returnWindowDays: 30 }, settings),
        { policy: 'none', windowDays: 0 }
    );
    // `replacement_only` KEEPS its window. This is the Phase 22 correction:
    // the window is how long the customer has to report a dead unit, and
    // zeroing it made a replacement-only product un-swappable the moment it was
    // delivered. It still settles at delivery (see maturesAt below) because
    // there is no refund to protect — the two questions are separate.
    assert.deepStrictEqual(
        resolveReturnPolicy({ returnPolicy: 'replacement_only', returnWindowDays: 30 }, settings),
        { policy: 'replacement_only', windowDays: 30 }
    );

    // No settings at all still resolves rather than throwing.
    assert.deepStrictEqual(resolveReturnPolicy({}, {}), { policy: 'full', windowDays: 7 });
    assert.deepStrictEqual(resolveReturnPolicy({}, null), { policy: 'full', windowDays: 7 });
    // A junk stored policy falls back instead of leaking through.
    assert.strictEqual(resolveReturnPolicy({ returnPolicy: 'bogus' }, settings).policy, 'full');

    // Admin can move the default for everything at once.
    assert.deepStrictEqual(
        resolveReturnPolicy({}, { defaultReturnPolicy: 'full', defaultReturnWindowDays: 14 }),
        { policy: 'full', windowDays: 14 }
    );

    // ── Which policies hold money ────────────────────────────────────────
    assert.ok(holdsMoney('full'));
    assert.ok(!holdsMoney('replacement_only'), 'a swap costs the vendor a unit, not cash');
    assert.ok(!holdsMoney('none'));

    assert.ok(canRefund('full'));
    assert.ok(!canRefund('replacement_only'));
    assert.ok(!canRefund('none'));

    assert.ok(canReplace('full'));
    assert.ok(canReplace('replacement_only'));
    assert.ok(!canReplace('none'), 'RAM and memory cards: neither');

    // ── The clock runs from DELIVERY, not from the order ─────────────────
    assert.deepStrictEqual(
        maturesAt(day(0), { policy: 'full', windowDays: 7 }),
        day(7)
    );
    assert.deepStrictEqual(
        maturesAt(day(10), { policy: 'full', windowDays: 3 }),
        day(13)
    );
    // Not refundable: matures at delivery, so it settles in the same pass.
    assert.deepStrictEqual(maturesAt(day(5), { policy: 'none', windowDays: 0 }), day(5));
    assert.deepStrictEqual(
        maturesAt(day(5), { policy: 'replacement_only', windowDays: 0 }),
        day(5)
    );
    // ...and STILL at delivery even carrying a real window. The window governs
    // the customer's right to act, never when the money moves — getting this
    // wrong would hold a vendor's money on a product nobody can refund.
    assert.deepStrictEqual(
        maturesAt(day(5), { policy: 'replacement_only', windowDays: 14 }),
        day(5)
    );
    // A 0-day full policy also matures immediately.
    assert.deepStrictEqual(maturesAt(day(5), { policy: 'full', windowDays: 0 }), day(5));

    // ── Is a return still open ───────────────────────────────────────────
    const full7 = { policy: 'full', windowDays: 7 };

    assert.ok(returnWindowState(full7, day(0), day(3)).open, 'day 3 of 7');
    assert.ok(returnWindowState(full7, day(0), day(7)).open, 'the last day is inclusive');
    assert.ok(!returnWindowState(full7, day(0), day(8)).open, 'day 8 is closed');
    assert.ok(returnWindowState(full7, day(0), day(8)).reason.includes('closed on'));

    // Undelivered is not returnable — that is what cancellation is for.
    assert.ok(!returnWindowState(full7, null).open);
    assert.ok(returnWindowState(full7, null).reason.includes('not been delivered'));

    // `none` is never open, however fresh the delivery.
    const none = { policy: 'none', windowDays: 0 };
    assert.ok(!returnWindowState(none, day(0), day(0)).open);
    assert.ok(returnWindowState(none, day(0), day(0)).reason.includes('not eligible'));

    // `replacement_only` with a real window stays open for those days, while
    // its money settled at delivery — the two are independent, which is the
    // point of keeping `holdsMoney` and `canReplace` separate predicates.
    const swap = { policy: 'replacement_only', windowDays: 14 };
    assert.ok(returnWindowState(swap, day(0), day(0)).open, 'open on the day');
    assert.ok(returnWindowState(swap, day(0), day(10)).open, 'and ten days later');
    assert.ok(!returnWindowState(swap, day(0), day(15)).open, 'closed after fourteen');
    assert.ok(!holdsMoney(swap.policy), 'but it never held any money');
    // A 0-day replacement window closes immediately, which is a legal (if
    // unhelpful) admin choice rather than the silent default it used to be.
    assert.ok(!returnWindowState({ policy: 'replacement_only', windowDays: 0 }, day(0), day(1)).open);

    // ── Validation ───────────────────────────────────────────────────────
    assert.strictEqual(returnPolicyError({}), null, 'omitting both leaves storage alone');
    assert.strictEqual(returnPolicyError({ returnPolicy: null, returnWindowDays: null }), null);
    assert.strictEqual(returnPolicyError({ returnPolicy: 'full', returnWindowDays: 7 }), null);
    assert.strictEqual(returnPolicyError({ returnPolicy: 'none', returnWindowDays: 0 }), null);
    assert.strictEqual(returnPolicyError({ returnWindowDays: 0 }), null);

    assert.ok(returnPolicyError({ returnPolicy: 'sometimes' })?.includes('must be one of'));
    assert.ok(returnPolicyError({ returnWindowDays: -1 })?.includes('0 or more'));
    assert.ok(returnPolicyError({ returnWindowDays: 2.5 })?.includes('whole number'));
    assert.ok(returnPolicyError({ returnWindowDays: 'soon' })?.includes('whole number'));
    assert.ok(returnPolicyError({ returnWindowDays: 20260101 })?.includes('not a date'));
    // Only `none` is a contradiction.
    assert.ok(
        returnPolicyError({ returnPolicy: 'none', returnWindowDays: 7 })?.includes('has no window')
    );
    // `replacement_only` with days is legal and is the whole point of Phase 22:
    // it is how long the customer has to report a dead unit.
    assert.strictEqual(returnPolicyError({ returnPolicy: 'replacement_only', returnWindowDays: 7 }), null);

    // ── Descriptions ─────────────────────────────────────────────────────
    assert.strictEqual(describeReturnPolicy(full7), '7-day return');
    assert.strictEqual(describeReturnPolicy({ policy: 'none', windowDays: 0 }), 'No return or replacement');
    assert.strictEqual(
        describeReturnPolicy({ policy: 'replacement_only', windowDays: 0 }),
        'Replacement only, no refund'
    );
    assert.strictEqual(
        describeReturnPolicy({ policy: 'replacement_only', windowDays: 14 }),
        'Replacement only, no refund'
    );
    assert.strictEqual(
        describeReturnPolicy({ policy: 'full', windowDays: 0 }),
        'Refundable on inspection at delivery'
    );

    console.log('returnPolicy: all checks passed');
}
