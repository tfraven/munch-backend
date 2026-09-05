const express = require('express');
const router = express.Router();

const {
  getRiderProfile,
  submitVerificationDocuments,
  updateVehicle,
  updateAvailability,
  updateLocation,
  getAvailableOrders,
  claimOrder,
  getActiveOrder,
  markArrivedAtVendor,
  pickupOrder,
  deliverOrder,
  getRiderEarnings,
} = require('../controllers/riderController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

// All rider routes require authentication and rider role
router.use(protect);
router.use(restrictTo('rider'));

// Profile & verification
router.get('/profile', getRiderProfile);
router.post('/documents', submitVerificationDocuments);
router.patch('/vehicle', updateVehicle);

// Real-time status & location (crucial for in-app map UI)
router.patch('/availability', updateAvailability);
router.post('/location', updateLocation);

// Order workflow
router.get('/orders/available', getAvailableOrders);
router.post('/orders/:id/claim', claimOrder);
router.get('/orders/active', getActiveOrder);
router.patch('/orders/:id/arrive-vendor', markArrivedAtVendor);
router.patch('/orders/:id/pickup', pickupOrder);
router.patch('/orders/:id/deliver', deliverOrder);

// Earnings
router.get('/earnings', getRiderEarnings);

module.exports = router;
