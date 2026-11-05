/**
 * One-off migration for the superadmin removal (2026-10-26).
 *
 * Two collections carry the old role in stored data, and both break quietly
 * rather than loudly if this never runs:
 *
 *   users        — role 'superadmin' is no longer in the enum, so the account
 *                  fails validation on its next save and every route check
 *                  (authorizeRoles("admin")) rejects it. The owner is locked
 *                  out of their own admin panel.
 *   transactions — 'superadmin_profit'/'superadmin_reversal' rows stop matching
 *                  reportController's switch, so the reports page under-reports
 *                  platform profit by however much was earned before the rename
 *                  instead of showing an error.
 *
 * Idempotent: re-running it matches nothing and reports 0.
 *
 * Usage: node scripts/removeSuperadmin.js
 */

const mongoose = require('mongoose');
const path = require('path');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.join(__dirname, '../config/config.env') });
}

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected\n');

    // Named so the log shows WHO was promoted — if the owner's account is in
    // here, that is the login they now use for everything.
    const promoting = await User.find({ role: 'superadmin' }, 'name email').lean();
    for (const u of promoting) {
        console.log(`  promoting ${u.email} (${u.name}) → admin`);
    }
    // updateMany, not save(): 'superadmin' is already out of the enum, so a
    // document validation pass would reject the very rows being fixed.
    const users = await User.updateMany({ role: 'superadmin' }, { $set: { role: 'admin' } });

    const profit = await Transaction.updateMany(
        { type: 'superadmin_profit' },
        { $set: { type: 'platform_profit' } }
    );
    const reversal = await Transaction.updateMany(
        { type: 'superadmin_reversal' },
        { $set: { type: 'platform_reversal' } }
    );

    console.log(`\n  users promoted to admin:        ${users.modifiedCount}`);
    console.log(`  platform_profit rows renamed:   ${profit.modifiedCount}`);
    console.log(`  platform_reversal rows renamed: ${reversal.modifiedCount}`);

    const leftover = await Transaction.countDocuments({ type: /^superadmin_/ });
    const leftoverUsers = await User.countDocuments({ role: 'superadmin' });
    if (leftover || leftoverUsers) {
        console.error(`\n❌ ${leftoverUsers} user(s) and ${leftover} transaction(s) still on the old names`);
        process.exitCode = 1;
    } else {
        console.log('\n✅ No superadmin data left.');
    }

    await mongoose.disconnect();
};

run().catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
});
