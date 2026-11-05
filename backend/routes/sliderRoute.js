const express = require('express');
const {
    getAllSliders,
    getAdminSliders,
    getSliderDetails,
    createSlider,
    updateSlider,
    deleteSlider,
    updateSliderOrder
} = require('../controllers/sliderController');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Public routes
router.route('/sliders').get(getAllSliders);

// Admin routes
router.route('/admin/sliders').get(isAuthenticatedUser, authorizeRoles('admin'), getAdminSliders);
router.route('/admin/slider/new').post(isAuthenticatedUser, authorizeRoles('admin'), createSlider);
router.route('/admin/slider/:id')
    .get(isAuthenticatedUser, authorizeRoles('admin'), getSliderDetails)
    .put(isAuthenticatedUser, authorizeRoles('admin'), updateSlider)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteSlider);
router.route('/admin/sliders/order').put(isAuthenticatedUser, authorizeRoles('admin'), updateSliderOrder);

module.exports = router;
