const express = require('express');
const {
    cronMatureSettlements,
    releaseDuePayouts,
    getSettlementQueue,
} = require('../controllers/settlementController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Vercel Cron, daily. Guarded by CRON_SECRET rather than a session, because
// the scheduler has no login — see settlementController.
//
// GET as well as POST because Vercel Cron issues a GET; POST is kept so this
// can be triggered by hand or by any other scheduler without surprise.
router.route('/cron/mature-settlements').get(cronMatureSettlements).post(cronMatureSettlements);

const adminOnly = [isAuthenticatedUser, authorizeRoles("admin")];

router.route('/admin/settlements/mature').post(adminOnly, releaseDuePayouts);
router.route('/admin/settlements/queue').get(adminOnly, getSettlementQueue);

module.exports = router;
