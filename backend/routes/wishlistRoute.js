const express = require('express');
const {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    clearWishlist,
    mergeWishlist,
} = require('../controllers/wishlistController');
const { isAuthenticatedUser } = require('../middlewares/auth');

const router = express.Router();

// Per-user and server-side, like the cart. Guests keep a local list and POST
// it to /wishlist/merge once they sign in.
router.route('/wishlist')
    .get(isAuthenticatedUser, getWishlist)
    .post(isAuthenticatedUser, addToWishlist)
    .delete(isAuthenticatedUser, clearWishlist);

router.route('/wishlist/merge').post(isAuthenticatedUser, mergeWishlist);

// Keyed by product, not by wishlist row — see the controller.
router.route('/wishlist/:productId').delete(isAuthenticatedUser, removeFromWishlist);

module.exports = router;
