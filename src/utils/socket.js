const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
// Adjust these imports to match your actual models
const Order = require('../models/Order');

let io = null;

const initSocket = (server) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
    },
  });

  // ---- Authenticate every socket connection ----
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Attach verified identity to the socket — never trust client-supplied IDs after this
      socket.user = {
        id: decoded.id,
        role: decoded.role, // e.g. 'customer' | 'vendor' | 'rider' | 'admin'
        vendorId: decoded.vendorId, // if applicable
      };
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { id: authUserId, role, vendorId: authVendorId } = socket.user;

    // ---- Join own user room — no client-supplied ID needed, use verified identity ----
    socket.on('join_user', () => {
      socket.join(`user_${authUserId}`);
    });

    // ---- Join own vendor room — verify caller actually owns/belongs to this vendor ----
    socket.on('join_vendor', (vendorId) => {
      if (role === 'vendor' && String(authVendorId) === String(vendorId)) {
        socket.join(`vendor_${vendorId}`);
      }
      // else silently ignore — do not join, do not leak why
    });

    // ---- Join own rider room ----
    socket.on('join_rider', () => {
      if (role === 'rider') {
        socket.join(`rider_${authUserId}`);
      }
    });

    // ---- Vendor fleet room — only riders employed by that vendor ----
    socket.on('join_vendor_fleet', (vendorId) => {
      if (role === 'rider' && String(authVendorId) === String(vendorId)) {
        socket.join(`vendor_fleet_${vendorId}`);
      }
    });

    // ---- Platform-wide rider broadcast pool ----
    socket.on('join_platform_riders', () => {
      if (role === 'rider') {
        socket.join('platform_riders');
      }
    });

    // ---- Order tracking room — verify the user is actually a party to this order ----
    socket.on('join_order_track', async (orderId) => {
      if (!orderId) return;
      try {
        const isAuthorized = await isUserPartOfOrder(orderId, authUserId, role, authVendorId);
        if (isAuthorized) {
          socket.join(`order_${orderId}`);
        }
      } catch (err) {
        console.error('join_order_track authorization check failed:', err);
      }
    });

    socket.on('leave_order_track', (orderId) => {
      if (orderId) {
        socket.leave(`order_${orderId}`);
      }
    });

    // ---- Chat typing — use verified identity, not client-supplied userId/role ----
    socket.on('chat:typing', ({ orderId }) => {
      if (orderId) {
        socket.to(`order_${orderId}`).emit('chat:user_typing', {
          orderId,
          userId: authUserId,
          role,
          isTyping: true,
        });
      }
    });

    socket.on('chat:stop_typing', ({ orderId }) => {
      if (orderId) {
        socket.to(`order_${orderId}`).emit('chat:user_typing', {
          orderId,
          userId: authUserId,
          role,
          isTyping: false,
        });
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
};

// ---- Authorization helper: confirm the user is actually part of this order ----
// Adjust field names to match your actual Order schema.
async function isUserPartOfOrder(orderId, userId, role, vendorId) {
  if (role === 'admin') return true;

  const order = await Order.findById(orderId).select('customer rider vendor').lean();
  if (!order) return false;

  if (role === 'customer') return String(order.customer) === String(userId);
  if (role === 'rider') return String(order.rider) === String(userId);
  if (role === 'vendor') return String(order.vendor) === String(vendorId);

  return false;
}

const getIO = () => io;

// ---- Notification and broadcast helpers (unchanged) ----
const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user_${userId}`).emit(event, payload);
};

const notifyVendorNewOrder = (vendorProfileId, order) => {
  if (io) io.to(`vendor_${vendorProfileId}`).emit('order:new', order);
};

const broadcastOrderToPlatformRiders = (order) => {
  if (io) io.to('platform_riders').emit('order:broadcast_available', order);
};

const notifyVendorDedicatedRiders = (vendorProfileId, order) => {
  if (io) io.to(`vendor_fleet_${vendorProfileId}`).emit('order:vendor_fleet_available', order);
};

const emitOrderUpdate = (orderId, order) => {
  if (io) io.to(`order_${orderId}`).emit('order:status_changed', order);
};

const emitRiderLocationToOrder = (orderId, locationData) => {
  if (io) io.to(`order_${orderId}`).emit('rider:location_ping', locationData);
};

const emitChatMessage = (orderId, message) => {
  if (io) io.to(`order_${orderId}`).emit('chat:receive_message', message);
};

const emitChatRead = (orderId, readData) => {
  if (io) io.to(`order_${orderId}`).emit('chat:read_receipt', readData);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  notifyVendorNewOrder,
  broadcastOrderToPlatformRiders,
  notifyVendorDedicatedRiders,
  emitOrderUpdate,
  emitRiderLocationToOrder,
  emitChatMessage,
  emitChatRead,
};