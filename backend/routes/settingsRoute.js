const express = require('express');
const {
    getPricingSettings,
    getPublicTaxSettings,
    updatePricingSettings,
    updateDefaultMarginBands,
    updateDefaultReturnPolicy,
} = require('../controllers/settingsController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// The tax rate is shown to everyone, including guests totalling up a cart,
// so it has its own unauthenticated read. It returns gstPct and nothing else.
router.route('/pricing-settings').get(getPublicTaxSettings);

// Vendors read this for the "you receive ₹X" breakdown on the product form —
// they need the margin to show their own net. Writing stays admin-only.
router.route('/admin/pricing-settings')
    .get(isAuthenticatedUser, authorizeRoles("vendor", "admin"), getPricingSettings)
    .put(isAuthenticatedUser, authorizeRoles("admin"), updatePricingSettings);

// The margin bands every product falls back to. Admin only — these decide what
// investors earn, even though they never move a customer's price.
router.route('/admin/default-margin-bands')
    .put(isAuthenticatedUser, authorizeRoles("admin"), updateDefaultMarginBands);

// The return window/policy every product falls back to. Admin only — this
// decides how long the platform holds a vendor's and an investor's money.
router.route('/admin/default-return-policy')
    .put(isAuthenticatedUser, authorizeRoles("admin"), updateDefaultReturnPolicy);

module.exports = router;
