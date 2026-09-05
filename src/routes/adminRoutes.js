const express = require('express');
const router = express.Router();

const {
  getVendorRequests,
  reviewVendorRequest,
  createVendorDirectly,
  getPendingRiders,
  verifyRider,
  getAllVendors,
  getAllRiders,
  toggleUserActiveStatus,
  getPlatformAnalytics,
} = require('../controllers/adminController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

// All admin routes require authentication and admin role
router.use(protect);
router.use(restrictTo('admin'));

// Vendor onboarding requests
router.get('/vendor-requests', getVendorRequests);
router.patch('/vendor-requests/:id/review', reviewVendorRequest);
router.post('/vendors', createVendorDirectly);
router.get('/vendors', getAllVendors);

// Rider document verification
router.get('/riders/pending-verification', getPendingRiders);
router.patch('/riders/:id/verify', verifyRider);
router.get('/riders', getAllRiders);

// Platform & user moderation
router.patch('/users/:userId/status', toggleUserActiveStatus);
router.get('/analytics', getPlatformAnalytics);

module.exports = router;
