const express = require('express');
const {
    createBlog,
    getAllBlogsAdmin,
    getAllBlogs,
    getBlogBySlug,
    getBlogById,
    updateBlog,
    deleteBlog,
    getLatestBlogs,
    getRelatedBlogs,
    getBlogCategories
} = require('../controllers/blogController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Public Routes
router.route('/blogs').get(getAllBlogs);
router.route('/blogs/latest').get(getLatestBlogs);
router.route('/blogs/categories').get(getBlogCategories);
router.route('/blog/slug/:slug').get(getBlogBySlug);
router.route('/blog/:id/related').get(getRelatedBlogs);

// Admin Routes
router.route('/admin/blogs').get(isAuthenticatedUser, authorizeRoles('admin'), getAllBlogsAdmin);
router.route('/admin/blog/new').post(isAuthenticatedUser, authorizeRoles('admin'), createBlog);
router.route('/admin/blog/:id')
    .get(isAuthenticatedUser, authorizeRoles('admin'), getBlogById)
    .put(isAuthenticatedUser, authorizeRoles('admin'), updateBlog)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteBlog);

module.exports = router;
