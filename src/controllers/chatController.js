const Order = require('../models/Order');
const CustomerProfile = require('../models/CustomerProfile');
const RiderProfile = require('../models/RiderProfile');
const ChatMessage = require('../models/ChatMessage');
const { handleControllerError } = require('./utils/errorHandler');
const { emitChatMessage, emitChatRead } = require('../utils/socket');

/**
 * Helper to validate if the current user is a participant (customer or assigned rider) of the order
 */
const getOrderChatContext = async (orderId, user) => {
  const order = await Order.findById(orderId)
    .populate('customer', 'user firstName lastName')
    .populate('rider', 'user firstName lastName');

  if (!order) {
    return { error: { status: 404, message: 'Order not found.' } };
  }

  const userIdStr = user._id.toString();

  // 1. Check if caller is Customer
  if (user.role === 'customer') {
    if (!order.customer || order.customer.user.toString() !== userIdStr) {
      return { error: { status: 403, message: 'You are not authorized to access chat for this order.' } };
    }
    if (!order.rider) {
      return { error: { status: 400, message: 'A rider has not been assigned to this order yet.' } };
    }
    return {
      order,
      senderRole: 'customer',
      receiverId: order.rider.user,
      receiverRole: 'rider',
    };
  }

  // 2. Check if caller is Rider
  if (user.role === 'rider') {
    if (!order.rider || order.rider.user.toString() !== userIdStr) {
      return { error: { status: 403, message: 'You are not the assigned rider for this order.' } };
    }
    if (!order.customer) {
      return { error: { status: 400, message: 'Order customer information is missing.' } };
    }
    return {
      order,
      senderRole: 'rider',
      receiverId: order.customer.user,
      receiverRole: 'customer',
    };
  }

  // 3. Admin can view messages
  if (user.role === 'admin') {
    return { order, isAdmin: true };
  }

  return { error: { status: 403, message: 'Only customers and assigned riders can chat on an order.' } };
};

/**
 * SEND MESSAGE
 * POST /api/v1/chat/order/:orderId
 */
const sendMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content cannot be empty.' });
    }

    const context = await getOrderChatContext(orderId, req.user);
    if (context.error) {
      return res.status(context.error.status).json({ message: context.error.message });
    }

    if (context.isAdmin) {
      return res.status(403).json({ message: 'Admins cannot send messages in customer-rider chat directly.' });
    }

    const chatMsg = await ChatMessage.create({
      order: orderId,
      sender: req.user._id,
      senderRole: context.senderRole,
      receiver: context.receiverId,
      receiverRole: context.receiverRole,
      message: message.trim(),
    });

    const populatedMsg = await ChatMessage.findById(chatMsg._id)
      .populate('sender', 'username email role')
      .populate('receiver', 'username email role');

    // Broadcast in real-time via Socket.io to the order room
    emitChatMessage(orderId, populatedMsg);

    return res.status(201).json({
      message: 'Message sent successfully.',
      chatMessage: populatedMsg,
    });
  } catch (error) {
    return handleControllerError(res, error, 'sendMessage');
  }
};

/**
 * GET CHAT MESSAGES FOR ORDER
 * GET /api/v1/chat/order/:orderId
 */
const getOrderMessages = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const context = await getOrderChatContext(orderId, req.user);
    if (context.error) {
      return res.status(context.error.status).json({ message: context.error.message });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [messages, total] = await Promise.all([
      ChatMessage.find({ order: orderId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limitNum)
        .populate('sender', 'username email role')
        .populate('receiver', 'username email role'),
      ChatMessage.countDocuments({ order: orderId }),
    ]);

    return res.status(200).json({
      orderId,
      totalMessages: total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      messages,
    });
  } catch (error) {
    return handleControllerError(res, error, 'getOrderMessages');
  }
};

/**
 * MARK MESSAGES AS READ
 * PATCH /api/v1/chat/order/:orderId/read
 */
const markMessagesAsRead = async (req, res) => {
  try {
    const { orderId } = req.params;

    const context = await getOrderChatContext(orderId, req.user);
    if (context.error) {
      return res.status(context.error.status).json({ message: context.error.message });
    }

    const now = new Date();

    // Mark all unread messages where current user is the receiver
    const updateResult = await ChatMessage.updateMany(
      {
        order: orderId,
        receiver: req.user._id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: now,
        },
      }
    );

    if (updateResult.modifiedCount > 0) {
      emitChatRead(orderId, {
        orderId,
        readBy: req.user._id,
        readAt: now,
        count: updateResult.modifiedCount,
      });
    }

    return res.status(200).json({
      message: 'Messages marked as read.',
      markedCount: updateResult.modifiedCount,
    });
  } catch (error) {
    return handleControllerError(res, error, 'markMessagesAsRead');
  }
};

module.exports = {
  sendMessage,
  getOrderMessages,
  markMessagesAsRead,
};
