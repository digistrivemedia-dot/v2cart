const express = require('express');
const {
    createCategory,
    getAllCategories,
    getActiveCategories,
    getCategory,
    updateCategory,
    deleteCategory,
    toggleCategoryStatus,
    reorderCategories
} = require('../controllers/categoryController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Public routes
router.route('/categories').get(getActiveCategories);
router.route('/category/:id').get(getCategory);

// Admin routes
router.route('/admin/categories')
    .get(isAuthenticatedUser, authorizeRoles("admin"), getAllCategories)
    .post(isAuthenticatedUser, authorizeRoles("admin"), createCategory);

router.route('/admin/category/:id')
    .get(isAuthenticatedUser, authorizeRoles("admin"), getCategory)
    .put(isAuthenticatedUser, authorizeRoles("admin"), updateCategory)
    .delete(isAuthenticatedUser, authorizeRoles("admin"), deleteCategory);

router.route('/admin/category/:id/toggle')
    .patch(isAuthenticatedUser, authorizeRoles("admin"), toggleCategoryStatus);

router.route('/admin/categories/reorder')
    .patch(isAuthenticatedUser, authorizeRoles("admin"), reorderCategories);

module.exports = router;
