const express = require('express');
const { getTransactionsSummary, getAllPayments } = require('../controllers/reportController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.route('/admin/transactions/summary').get(
    isAuthenticatedUser, authorizeRoles("admin"), getTransactionsSummary
);

router.route('/admin/payments').get(
    isAuthenticatedUser, authorizeRoles("admin"), getAllPayments
);

module.exports = router;
