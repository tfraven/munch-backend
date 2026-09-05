const express = require('express');
const router = express.Router();

const {
  listMyAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} = require('../controllers/addressController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Listing/adding multiple addresses only makes sense for customers —
// vendors have exactly one address, created at registration.
router.get('/me', protect, restrictTo('customer'), listMyAddresses);
router.post('/me', protect, restrictTo('customer'), addAddress);
router.patch('/:addressId/default', protect, restrictTo('customer'), setDefaultAddress);
router.delete('/:addressId', protect, restrictTo('customer'), deleteAddress);

// Update is shared: a vendor updates their single Address doc through the
// same endpoint. Ownership (not role) is what the controller actually
// checks here, so both roles can hit it safely.
router.patch('/:addressId', protect, restrictTo('customer', 'vendor'), updateAddress);

module.exports = router;