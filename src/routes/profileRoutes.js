const express = require('express');
const router = express.Router();

const {
  getMyProfile,
  updateMyProfile,
  updateRiderAvailability,
  verifyVendor,
  verifyRider,
  setUserActiveStatus,
} = require('../controllers/profileController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Self-service (any authenticated role)
router.get('/me', protect, getMyProfile);
router.patch('/me', protect, updateMyProfile);

// Rider self-status
router.patch('/me/availability', protect, restrictTo('rider'), updateRiderAvailability);

// Admin-only moderation
router.patch('/vendors/:vendorProfileId/verify', protect, restrictTo('admin'), verifyVendor);
router.patch('/riders/:riderProfileId/verify', protect, restrictTo('admin'), verifyRider);
router.patch('/users/:userId/status', protect, restrictTo('admin'), setUserActiveStatus);

module.exports = router;