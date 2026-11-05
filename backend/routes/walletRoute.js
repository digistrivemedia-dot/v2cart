const express = require('express');
const {
    getMyWallet,
    getMyStatement,
    getMySummary,
    createTopupOrder,
    verifyTopup,
} = require('../controllers/walletController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Customers pay by card at checkout and have no wallet.
//
// Phase 23 — vendors read theirs too: their sale proceeds are credited to the
// same `earnings` bucket at maturation. Only TOPUP stays investor-only, since
// a vendor has nothing to deploy capital into.
const earnsMoney = [isAuthenticatedUser, authorizeRoles("investor", "vendor")];
const investorOnly = [isAuthenticatedUser, authorizeRoles("investor")];

router.route('/wallet').get(earnsMoney, getMyWallet);
router.route('/wallet/statement').get(earnsMoney, getMyStatement);
router.route('/wallet/summary').get(earnsMoney, getMySummary);
router.route('/wallet/topup/order').post(investorOnly, createTopupOrder);
router.route('/wallet/topup/verify').post(investorOnly, verifyTopup);

module.exports = router;
