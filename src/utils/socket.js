const { Server } = require('socket.io');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    },
  });

  io.on('connection', (socket) => {
    // Client joins user room
    socket.on('join_user', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    // Client joins vendor room
    socket.on('join_vendor', (vendorId) => {
      if (vendorId) {
        socket.join(`vendor_${vendorId}`);
      }
    });

    // Client joins rider room
    socket.on('join_rider', (riderId) => {
      if (riderId) {
        socket.join(`rider_${riderId}`);
      }
    });

    // Dedicated vendor riders join their employer vendor pool
    socket.on('join_vendor_fleet', (vendorId) => {
      if (vendorId) {
        socket.join(`vendor_fleet_${vendorId}`);
      }
    });

    // Platform riders join platform broadcast room
    socket.on('join_platform_riders', () => {
      socket.join('platform_riders');
    });

    // Join specific order room for live tracking (customer, rider, vendor, admin)
    socket.on('join_order_track', (orderId) => {
      if (orderId) {
        socket.join(`order_${orderId}`);
      }
    });

    // Leave order room
    socket.on('leave_order_track', (orderId) => {
      if (orderId) {
        socket.leave(`order_${orderId}`);
      }
    });

    // In-App Chat Typing Events
    socket.on('chat:typing', ({ orderId, userId, role, senderName }) => {
      if (orderId) {
        socket.to(`order_${orderId}`).emit('chat:user_typing', { orderId, userId, role, senderName, isTyping: true });
      }
    });

    socket.on('chat:stop_typing', ({ orderId, userId, role }) => {
      if (orderId) {
        socket.to(`order_${orderId}`).emit('chat:user_typing', { orderId, userId, role, isTyping: false });
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

// Notification and broadcast helpers
const emitToUser = (userId, event, payload) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, payload);
  }
};

const notifyVendorNewOrder = (vendorProfileId, order) => {
  if (io) {
    io.to(`vendor_${vendorProfileId}`).emit('order:new', order);
  }
};

const broadcastOrderToPlatformRiders = (order) => {
  if (io) {
    io.to('platform_riders').emit('order:broadcast_available', order);
  }
};

const notifyVendorDedicatedRiders = (vendorProfileId, order) => {
  if (io) {
    io.to(`vendor_fleet_${vendorProfileId}`).emit('order:vendor_fleet_available', order);
  }
};

const emitOrderUpdate = (orderId, order) => {
  if (io) {
    io.to(`order_${orderId}`).emit('order:status_changed', order);
  }
};

const emitRiderLocationToOrder = (orderId, locationData) => {
  if (io) {
    io.to(`order_${orderId}`).emit('rider:location_ping', locationData);
  }
};

// Real-time Chat Helpers
const emitChatMessage = (orderId, message) => {
  if (io) {
    io.to(`order_${orderId}`).emit('chat:receive_message', message);
  }
};

const emitChatRead = (orderId, readData) => {
  if (io) {
    io.to(`order_${orderId}`).emit('chat:read_receipt', readData);
  }
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

