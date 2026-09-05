const express = require('express');
const router = express.Router();

const {
  getMyVendorProfile,
  updateVendorProfile,
  getDedicatedRiders,
  addDedicatedRider,
  removeDedicatedRider,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getStoreOrders,
  acceptOrder,
  rejectOrder,
  markOrderPreparing,
  markOrderReady,
  assignOrderToDedicatedRider,
  confirmCustomerPickup,
  getVendorStats,
} = require('../controllers/vendorController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

// All vendor routes require authentication and vendor role
router.use(protect);
router.use(restrictTo('vendor'));

// Profile & settings
router.get('/profile', getMyVendorProfile);
router.patch('/profile', updateVendorProfile);

// Dedicated rider fleet
router.get('/riders', getDedicatedRiders);
router.post('/riders/assign', addDedicatedRider);
router.delete('/riders/:riderId', removeDedicatedRider);

// Menu categories
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Menu items
router.get('/menu-items', getMenuItems);
router.post('/menu-items', createMenuItem);
router.put('/menu-items/:id', updateMenuItem);
router.delete('/menu-items/:id', deleteMenuItem);

// Store orders & fulfillment
router.get('/orders', getStoreOrders);
router.patch('/orders/:id/accept', acceptOrder);
router.patch('/orders/:id/reject', rejectOrder);
router.patch('/orders/:id/preparing', markOrderPreparing);
router.patch('/orders/:id/ready', markOrderReady);
router.patch('/orders/:id/assign-rider', assignOrderToDedicatedRider);
router.patch('/orders/:id/confirm-pickup', confirmCustomerPickup);

// Sales analytics
router.get('/stats', getVendorStats);

module.exports = router;
