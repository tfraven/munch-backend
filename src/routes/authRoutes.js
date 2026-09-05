const express = require('express');
const router = express.Router();

const { register, submitVendorRequest, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/vendor-request', submitVendorRequest);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;