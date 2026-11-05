const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');
const Order = require('../models/orderModel');
const { matureDue } = require('../utils/settlement');

/**
 * Releasing payouts whose return window has closed — see Phase 21.
 *
 * Two triggers, one function. The backend runs on Vercel serverless, so there
 * is no process to hang a cron on: the schedule has to come from outside and
 * POST its way in.
 *
 *   POST /cron/mature-settlements   Vercel Cron, daily, CRON_SECRET header
 *   POST /admin/settlements/mature  admin's "Release due payouts" button
 *
 * Both are safe to fire at any time and as often as you like: `item.settledAt`
 * is written in the same transaction as the rows it describes, so a double run
 * credits once (see utils/settlement.js).
 */

/**
 * Daily cron.
 *
 * Unauthenticated in the usual sense — Vercel Cron carries no session — so the
 * shared secret is the whole guard and a missing `CRON_SECRET` is treated as a
 * misconfiguration rather than as "no check needed". Refusing to run is the
 * safe failure here: payouts are late, which the admin button can fix, instead
 * of the endpoint being open to anyone who finds the URL.
 */
exports.cronMatureSettlements = asyncErrorHandler(async (req, res, next) => {
    const expected = process.env.CRON_SECRET;

    if (!expected) {
        return next(new ErrorHandler(
            'CRON_SECRET is not configured, so scheduled payouts are disabled',
            503
        ));
    }

    // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; the explicit
    // header is accepted too so this can be curl'd from anywhere else.
    const provided = req.headers['x-cron-secret']
        || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (provided !== expected) {
        return next(new ErrorHandler('Invalid cron secret', 401));
    }

    const summary = await matureDue(new Date());

    res.status(200).json({ success: true, ...summary });
});

/**
 * Admin's manual run.
 *
 * The fallback for a cron that never fired, and the only way to test a 7-day
 * window without waiting a week.
 */
exports.releaseDuePayouts = asyncErrorHandler(async (req, res) => {
    const summary = await matureDue(new Date());

    res.status(200).json({
        success: true,
        message: summary.itemsSettled > 0
            ? `Released ${summary.itemsSettled} order line(s) — ₹${summary.paidOut.toFixed(2)} `
              + `paid out to ${summary.investorsPaid} investor unit(s)`
            : 'Nothing is due right now',
        ...summary,
    });
});

/**
 * What is waiting, and what is stuck ---ADMIN
 *
 * Two questions the admin dashboard has to answer, and the second one matters
 * more than it looks:
 *
 *   • money inside its return window, with the date each line releases
 *   • DELIVERED-BUT-NEVER-MARKED orders — `deliveredAt` is set by a manual
 *     status change, so an order nobody marks delivered never matures and
 *     never pays its vendor or investor. That is a silent non-payment, and the
 *     only way it surfaces is a queue like this one.
 */
exports.getSettlementQueue = asyncErrorHandler(async (req, res) => {
    const now = new Date();

    // Phase 22 — orders frozen by a pending request. These lines may be past
    // their release date and are deliberately NOT paying out, so they are
    // labelled rather than left looking overdue: a request nobody decides
    // freezes a vendor's money, and that has to be visible.
    const OrderRequest = require('../models/orderRequestModel');
    const heldByRequest = new Set(
        (await OrderRequest.distinct('order', { status: 'pending' })).map(String)
    );

    const holding = await Order.find({
        orderStatus: { $nin: ['Cancelled', 'Returned'] },
        orderItems: { $elemMatch: { maturesAt: { $ne: null }, settledAt: null, returnedAt: null } },
    })
        .select('orderItems orderStatus deliveredAt createdAt user totalPrice')
        .populate('user', 'name email')
        .sort({ deliveredAt: 1 })
        .limit(200);

    const lines = [];
    for (const order of holding) {
        for (const item of order.orderItems) {
            if (!item.maturesAt || item.settledAt || item.returnedAt) continue;
            lines.push({
                order: order._id,
                customer: order.user?.name || null,
                product: item.product,
                name: item.name,
                quantity: item.quantity,
                returnPolicy: item.returnPolicy,
                returnWindowDays: item.returnWindowDays,
                deliveredAt: order.deliveredAt,
                maturesAt: item.maturesAt,
                due: new Date(item.maturesAt) <= now,
                fundedUnits: item.matchedInvestments?.length || 0,
                // Frozen pending an admin decision on a cancellation or
                // return request — not merely waiting out its window.
                heldByRequest: heldByRequest.has(String(order._id)),
            });
        }
    }

    // Shipped but never marked delivered. No `maturesAt` exists on these at
    // all, which is exactly why they cannot show up in the query above.
    const undelivered = await Order.find({
        orderStatus: 'Shipped',
        deliveredAt: null,
    })
        .select('shippedAt createdAt user totalPrice')
        .populate('user', 'name email')
        .sort({ shippedAt: 1 })
        .limit(100);

    res.status(200).json({
        success: true,
        holding: lines.sort((a, b) => new Date(a.maturesAt) - new Date(b.maturesAt)),
        // Due AND releasable. A line frozen by a request is excluded, because
        // the release button genuinely will not pay it.
        dueNow: lines.filter((l) => l.due && !l.heldByRequest).length,
        awaitingDecision: lines.filter((l) => l.heldByRequest).length,
        // Surfaced rather than auto-resolved: marking goods delivered that may
        // never have arrived would release the customer's refund right on a
        // guess. Admin decides.
        awaitingDeliveryMark: undelivered.map((order) => ({
            order: order._id,
            customer: order.user?.name || null,
            shippedAt: order.shippedAt,
            daysSinceShipped: order.shippedAt
                ? Math.floor((now - new Date(order.shippedAt)) / 86400000)
                : null,
            totalPrice: order.totalPrice,
        })),
    });
});
