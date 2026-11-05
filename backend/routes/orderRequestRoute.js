const express = require('express');
const {
    getRequestOptions,
    createRequest,
    myRequests,
    getAllRequests,
    getRequestForOrder,
    decideRequest,
} = require('../controllers/orderRequestController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// ── Customer ──
// Both scope to the signed-in user's own orders inside the controller, so one
// customer cannot read or act on another's order by guessing an id.
router.route('/order/:id/request')
    .get(isAuthenticatedUser, getRequestOptions)
    .post(isAuthenticatedUser, createRequest);

router.route('/requests/me').get(isAuthenticatedUser, myRequests);

// ── Admin ──
const adminOnly = [isAuthenticatedUser, authorizeRoles("admin")];

router.route('/admin/order-requests').get(adminOnly, getAllRequests);
router.route('/admin/order/:id/request').get(adminOnly, getRequestForOrder);
router.route('/admin/order-request/:id').put(adminOnly, decideRequest);

module.exports = router;
