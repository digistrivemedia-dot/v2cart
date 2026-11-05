const express = require('express');
const {
    createCoupon,
    getAllCoupons,
    getActiveCoupons,
    getCoupon,
    validateCoupon,
    applyCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus
} = require('../controllers/couponController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Public routes
router.route('/active').get(getActiveCoupons);

// User routes (authenticated — coupons are customer-only, see couponController)
router.route('/validate').post(isAuthenticatedUser, validateCoupon);
router.route('/apply').post(isAuthenticatedUser, applyCoupon);

// Admin routes
router.route('/admin/coupons')
    .get(isAuthenticatedUser, authorizeRoles("admin"), getAllCoupons)
    .post(isAuthenticatedUser, authorizeRoles("admin"), createCoupon);

router.route('/admin/coupon/:id')
    .get(isAuthenticatedUser, authorizeRoles("admin"), getCoupon)
    .put(isAuthenticatedUser, authorizeRoles("admin"), updateCoupon)
    .delete(isAuthenticatedUser, authorizeRoles("admin"), deleteCoupon);

router.route('/admin/coupon/:id/toggle')
    .patch(isAuthenticatedUser, authorizeRoles("admin"), toggleCouponStatus);

module.exports = router;
