/**
 * Drop the stale UNIQUE constraint on investments.paymentId.
 *
 * ── The bug this fixes ─────────────────────────────────────────────────────
 *
 * Investments used to be funded by card, one Razorpay payment per investment,
 * so `paymentId` was `{ unique: true, sparse: true }`. When investing moved to
 * the wallet, one payment stopped backing one investment and the model was
 * changed to a plain sparse index — but a declared index never alters an index
 * that already exists, so the live database kept the unique one.
 *
 * `sparse` only skips documents where the field is ABSENT. Documents carrying
 * an explicit `null` are indexed like any other value, and
 * investmentController writes `paymentId: null` on every wallet-funded
 * investment. So the first such investment claimed the single available null
 * slot and every one after it failed:
 *
 *     E11000 duplicate key error ... index: paymentId_1 dup key: { paymentId: null }
 *
 * That takes down investing entirely — including any multi-unit batch, which
 * writes several nulls inside one transaction.
 *
 * The index itself is worth keeping: investmentController still queries
 * `paymentId` to detect a replayed gateway payment. Only the uniqueness goes.
 *
 *   node scripts/fixPaymentIdIndex.js          apply
 *   node scripts/fixPaymentIdIndex.js --check  report only
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: './config/config.env' });

const checkOnly = process.argv.includes('--check');

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const collection = mongoose.connection.db.collection('investments');

    try {
        const indexes = await collection.indexes();
        const existing = indexes.find((ix) => ix.name === 'paymentId_1');

        if (!existing) {
            console.log('No paymentId_1 index — nothing to do.');
            return;
        }

        console.log('Current:', JSON.stringify({
            unique: !!existing.unique,
            sparse: !!existing.sparse,
        }));

        if (!existing.unique) {
            console.log('Already non-unique — nothing to do.');
            return;
        }

        const explicitNulls = await collection.countDocuments({ paymentId: { $type: 10 } });
        const absent = await collection.countDocuments({ paymentId: { $exists: false } });
        console.log(
            `${explicitNulls} investment(s) carry an explicit null, ${absent} have no field at all.`
        );
        console.log(
            'While the unique index exists, the NEXT wallet-funded investment fails with E11000.'
        );

        if (checkOnly) {
            console.log('\n--check: no changes made. Re-run without it to fix.');
            return;
        }

        await collection.dropIndex('paymentId_1');
        console.log('Dropped the unique index.');

        // Recreated sparse and NOT unique, matching investmentModel.js. Still
        // an index, because the controller queries this field to spot a
        // replayed gateway payment.
        await collection.createIndex({ paymentId: 1 }, { sparse: true, background: true });
        console.log('Recreated as { sparse: true }, non-unique.');

        const after = (await collection.indexes()).find((ix) => ix.name === 'paymentId_1');
        console.log('Now:', JSON.stringify({ unique: !!after.unique, sparse: !!after.sparse }));
        console.log('\nInvesting works again. Verify with: node scripts/returnWindow.check.js');
    } finally {
        await mongoose.disconnect();
    }
})();
