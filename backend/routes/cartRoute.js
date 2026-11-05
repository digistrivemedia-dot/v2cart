const express = require('express');
const {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    mergeCart,
} = require('../controllers/cartController');
const { isAuthenticatedUser } = require('../middlewares/auth');

const router = express.Router();

// The cart is per-user and server-side, so every route needs a session. There
// is deliberately no guest cart here — clients keep that locally and POST it
// to /cart/merge once the customer signs in.
router.route('/cart')
    .get(isAuthenticatedUser, getCart)
    .post(isAuthenticatedUser, addToCart)
    .delete(isAuthenticatedUser, clearCart);

router.route('/cart/merge').post(isAuthenticatedUser, mergeCart);

router.route('/cart/:itemId')
    .put(isAuthenticatedUser, updateCartItem)
    .delete(isAuthenticatedUser, removeCartItem);

module.exports = router;
