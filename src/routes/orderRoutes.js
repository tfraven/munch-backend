const express = require('express');
const router = express.Router();

const { trackOrder } = require('../controllers/customerController');
const { protect } = require('../middleware/authMiddleware');
const Order = require('../models/Order');

// Track an order for in-app map UI (Customer, Rider, Vendor, or Admin)
router.get('/:id/track', protect, trackOrder);

// Universal order details lookup with permission check
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('vendor', 'storeName phone logoUrl address location')
      .populate('rider', 'firstName lastName phone vehicle location heading speed')
      .populate('customer', 'firstName lastName phone');

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    return res.status(200).json({ order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
