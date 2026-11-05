const express = require('express');
const router = express.Router();
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');
const {
    createRazorpayOrder,
    verifyRazorpayPayment,
    getRazorpayPaymentDetails,
    createRefund,
} = require('../controllers/razorpayController');

// Create Razorpay Order (Before Payment)
router.route('/payment/razorpay/order').post(isAuthenticatedUser, createRazorpayOrder);

// Verify Razorpay Payment (After Payment)
router.route('/payment/razorpay/verify').post(isAuthenticatedUser, verifyRazorpayPayment);

// Get Payment Details
router.route('/payment/razorpay/:payment_id').get(isAuthenticatedUser, getRazorpayPaymentDetails);

// Create Refund ---ADMIN
//
// This was guarded by `isAuthenticatedUser` alone, which meant any logged-in
// customer could refund any payment id they could name. Phase 21 made the
// refund path load-bearing (a return refunds the customer out of money the
// platform is still holding), so it is admin-only now. The return flow itself
// goes through PUT /admin/order/:id with status "Returned", which prices the
// refund from the database rather than from a request body — this endpoint
// stays only for one-off manual corrections.
router.route('/payment/razorpay/refund').post(
    isAuthenticatedUser, authorizeRoles("admin"), createRefund
);

module.exports = router;
