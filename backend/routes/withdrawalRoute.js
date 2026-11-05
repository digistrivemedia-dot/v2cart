const express = require('express');
const {
    requestWithdrawal,
    myWithdrawals,
    syncWithdrawal,
    payoutWebhook,
} = require('../controllers/withdrawalController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Phase 23 — vendors withdraw through the same flow. Their sale proceeds are
// credited to the same `earnings` bucket at maturation, and the controller
// reads their bank details off vendorProfile (see profileKeyFor).
const earnsMoney = [isAuthenticatedUser, authorizeRoles("investor", "vendor")];

router.route('/withdrawals')
    .get(earnsMoney, myWithdrawals)
    .post(earnsMoney, requestWithdrawal);

router.route('/withdrawals/:id/sync').post(earnsMoney, syncWithdrawal);

// Unauthenticated because RazorpayX calls it. Safe only because the handler
// verifies the HMAC signature before trusting a single field — see
// verifyPayoutWebhook in utils/razorpayPayouts.js.
router.route('/withdrawals/webhook').post(payoutWebhook);

module.exports = router;
