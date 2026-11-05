/**
 * Fast-forward a delivered order's return window, so a release can be seen now
 * instead of in seven days.
 *
 * The testing tool Phase 21 needs. A 7-day window is correct behaviour and
 * completely untestable by hand: you mark an order delivered, the admin queue
 * says "releases in 7 days", and clicking "Release due payouts" rightly does
 * nothing. This backdates `maturesAt` on the unsettled lines so the next
 * release — the button, or the cron — pays them out.
 *
 * Touches ONLY `maturesAt`, and only on lines that are neither settled nor
 * returned. It moves no money itself: the release path still does all of it,
 * which is the point — you are testing the real thing, just not the calendar.
 *
 *   node scripts/closeReturnWindow.js                 list what is being held
 *   node scripts/closeReturnWindow.js <orderId>       one order
 *   node scripts/closeReturnWindow.js --all           every held order
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });

const Order = require('../models/orderModel');

const arg = process.argv[2];
const DAY_MS = 86_400_000;

const HELD = {
    orderStatus: { $nin: ['Cancelled', 'Returned'] },
    orderItems: { $elemMatch: { maturesAt: { $ne: null }, settledAt: null, returnedAt: null } },
};

const fmt = (d) =>
    d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    try {
        if (!arg) {
            const held = await Order.find(HELD).select('orderItems orderStatus deliveredAt').limit(50);

            if (held.length === 0) {
                console.log('Nothing is being held.\n');
                console.log('To get something into the queue: place an order on a product whose');
                console.log('return policy is "full", then mark the order Shipped and Delivered.');
                return;
            }

            console.log(`${held.length} order(s) holding money:\n`);
            for (const order of held) {
                const due = order.orderItems.filter(
                    (i) => i.maturesAt && !i.settledAt && !i.returnedAt
                );
                console.log(`  ${order._id}  (${order.orderStatus}, delivered ${fmt(order.deliveredAt)})`);
                for (const item of due) {
                    const days = Math.ceil((new Date(item.maturesAt) - Date.now()) / DAY_MS);
                    console.log(
                        `      ${item.name} — releases ${fmt(item.maturesAt)}`
                        + ` (${days > 0 ? `in ${days}d` : 'DUE NOW'})`
                    );
                }
            }
            console.log('\nTo make one releasable now:');
            console.log(`  node scripts/closeReturnWindow.js ${held[0]._id}`);
            console.log('  node scripts/closeReturnWindow.js --all');
            return;
        }

        const orders = arg === '--all'
            ? await Order.find(HELD)
            : [await Order.findById(arg)];

        if (!orders[0]) {
            console.error(`No order found for ${arg}`);
            process.exitCode = 1;
            return;
        }

        let moved = 0;
        for (const order of orders) {
            if (!order.deliveredAt) {
                console.log(`  skipped ${order._id} — not delivered yet, so no window has started`);
                continue;
            }

            let touched = 0;
            for (const item of order.orderItems) {
                if (!item.maturesAt || item.settledAt || item.returnedAt) continue;
                item.maturesAt = new Date(Date.now() - DAY_MS);
                touched++;
            }

            if (touched === 0) {
                console.log(`  skipped ${order._id} — nothing unsettled on it`);
                continue;
            }

            await order.save({ validateBeforeSave: false });
            moved += touched;
            console.log(`  ${order._id} — ${touched} line(s) now due`);
        }

        if (moved > 0) {
            console.log(`\n${moved} line(s) are due. Release them with either:`);
            console.log('  • admin UI  -> Reports -> "Release due payouts"');
            console.log('  • the cron  -> curl -X POST http://localhost:4000/api/v1/cron/mature-settlements \\');
            console.log('                      -H "x-cron-secret: $CRON_SECRET"');
        }
    } finally {
        await mongoose.disconnect();
    }
})();
