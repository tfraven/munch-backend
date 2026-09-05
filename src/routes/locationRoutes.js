const express = require('express');
const router = express.Router();

const { updateMyLocation, getNearbyAvailableRiders } = require('../controllers/locationController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.patch('/me', protect, restrictTo('rider'), updateMyLocation);

// Assumption: nearby-rider lookup is an internal dispatch tool used by
// vendors placing an order and admins, not exposed to customers directly.
// Adjust the restrictTo list if customers need this too (e.g. live rider
// tracking on an order).
router.get('/riders/nearby', protect, restrictTo('vendor', 'admin'), getNearbyAvailableRiders);

module.exports = router;