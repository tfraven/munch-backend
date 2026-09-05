const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['customer', 'rider'],
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverRole: {
      type: String,
      enum: ['customer', 'rider'],
      required: true,
    },
    message: {
      type: String,
      required: [true, 'Message text is required.'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters.'],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient message retrieval in an order sorted chronologically
chatMessageSchema.index({ order: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
