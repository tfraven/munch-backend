const express = require('express');
const router = express.Router();

const { updateMyLocation, getNearbyAvailableRiders } = require('../controllers/locationController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.patch('/me', protect, restrictTo('rider'), updateMyLocation);

// Allow vendors, admins, and customers to query nearby riders for dispatch and map discovery
router.get('/riders/nearby', protect, restrictTo('vendor', 'admin', 'customer'), getNearbyAvailableRiders);

module.exports = router;