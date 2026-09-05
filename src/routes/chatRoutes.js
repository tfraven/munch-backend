const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

// All chat routes require authentication
router.use(protect);

// Send message in an order's chat
router.post('/order/:orderId', chatController.sendMessage);

// Get chat history for an order
router.get('/order/:orderId', chatController.getOrderMessages);

// Mark received messages as read
router.patch('/order/:orderId/read', chatController.markMessagesAsRead);

module.exports = router;
