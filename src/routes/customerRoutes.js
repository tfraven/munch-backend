const express = require('express');
const router = express.Router();

const {
  getNearbyVendors,
  getVendorDetailsAndMenu,
  calculateCheckoutPreview,
  placeOrder,
  getCustomerOrders,
  getOrderDetails,
  trackOrder,
  cancelCustomerOrder,
} = require('../controllers/customerController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public / Guest accessible store browsing
router.get('/vendors', getNearbyVendors);
router.get('/vendors/:id', getVendorDetailsAndMenu);
router.post('/orders/checkout-preview', calculateCheckoutPreview);

// Customer-only authenticated routes
router.use(protect);
router.use(restrictTo('customer'));

router.post('/orders', placeOrder);
router.get('/orders', getCustomerOrders);
router.get('/orders/:id', getOrderDetails);
router.get('/orders/:id/track', trackOrder);
router.patch('/orders/:id/cancel', cancelCustomerOrder);

module.exports = router;
