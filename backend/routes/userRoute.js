const express = require('express');
const {
    registerUser,
    loginUser,
    logoutUser,
    getUserDetails,
    forgotPassword,
    resetPassword,
    updatePassword,
    updateProfile,
    getAllUsers,
    getSingleUser,
    updateUserRole,
    approveUserProfile,
    deleteUser,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
} = require('../controllers/userController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.route('/register').post(registerUser);
router.route('/login').post(loginUser);
router.route('/logout').get(logoutUser);

router.route('/me').get(isAuthenticatedUser, getUserDetails);

router.route('/password/forgot').post(forgotPassword);
router.route('/password/reset/:token').put(resetPassword);

router.route('/password/update').put(isAuthenticatedUser, updatePassword);

router.route('/me/update').put(isAuthenticatedUser, updateProfile);

// Address Management Routes
router.route('/me/addresses/new').post(isAuthenticatedUser, addAddress);
router.route('/me/addresses/:addressId').put(isAuthenticatedUser, updateAddress);
router.route('/me/addresses/:addressId').delete(isAuthenticatedUser, deleteAddress);
router.route('/me/addresses/:addressId/default').put(isAuthenticatedUser, setDefaultAddress);

router.route("/admin/users").get(isAuthenticatedUser, authorizeRoles("admin"), getAllUsers);

router.route("/admin/user/:id")
    .get(isAuthenticatedUser, authorizeRoles("admin"), getSingleUser)
    .put(isAuthenticatedUser, authorizeRoles("admin"), updateUserRole)
    .delete(isAuthenticatedUser, authorizeRoles("admin"), deleteUser);

router.route("/admin/user/:id/approve")
    .put(isAuthenticatedUser, authorizeRoles("admin"), approveUserProfile);

module.exports = router;