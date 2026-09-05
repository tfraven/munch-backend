const mongoose = require('mongoose');

const coordinateValidator = {
  validator: function (arr) {
    if (!arr || (Array.isArray(arr) && arr.length === 0)) return true; // Optional if not set
    if (!Array.isArray(arr) || arr.length !== 2) return false;
    const [lng, lat] = arr;
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  },
  message: 'Coordinates must be [longitude, latitude] within valid bounds.',
};

const addressPointSchema = new mongoose.Schema(
  {
    addressLine: { type: String },
    city: { type: String },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], validate: coordinateValidator },
    },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        'PENDING',
        'ACCEPTED_BY_VENDOR',
        'PREPARING',
        'READY_FOR_PICKUP',
        'RIDER_ASSIGNED',
        'RIDER_ARRIVED_AT_VENDOR',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
      ],
    },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      default: () => 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProfile', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', required: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderProfile', default: null },

    orderType: {
      type: String,
      enum: ['DELIVERY', 'PICKUP'],
      default: 'DELIVERY',
      required: true,
    },

    dispatchType: {
      type: String,
      enum: ['NONE', 'VENDOR_FLEET', 'PLATFORM_BROADCAST'],
      default: 'NONE',
    },

    items: {
      type: [
        {
          menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
          name: { type: String, required: true },
          price: { type: Number, required: true, min: 0 },
          quantity: { type: Number, required: true, min: 1 },
          selectedOptions: [{ name: String, price: Number }],
        },
      ],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Order must contain at least one item.',
      },
    },

    pricing: {
      subtotal: { type: Number, required: true, min: 0 },
      deliveryFee: { type: Number, default: 0, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      tax: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },

    status: {
      type: String,
      enum: [
        'PENDING',
        'ACCEPTED_BY_VENDOR',
        'PREPARING',
        'READY_FOR_PICKUP',
        'RIDER_ASSIGNED',
        'RIDER_ARRIVED_AT_VENDOR',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
      ],
      default: 'PENDING',
    },

    statusHistory: [statusHistorySchema],

    // Security OTPs for in-person handoffs
    deliveryOtp: { type: String }, // 4-digit code customer gives to rider
    pickupOtp: { type: String },   // 4-digit code customer shows vendor for self-pickup

    distanceKm: { type: Number, default: 0 },
    prepTimeMinutes: { type: Number, default: 20 },
    estimatedDeliveryTime: { type: Date },

    cancellation: {
      cancelledBy: {
        type: String,
        enum: ['customer', 'vendor', 'rider', 'admin', 'system'],
      },
      reason: { type: String, trim: true },
      cancelledAt: { type: Date },
    },

    specialInstructions: { type: String, trim: true, maxlength: 500 },

    payment: {
      method: { type: String, enum: ['CARD', 'CASH_ON_DELIVERY', 'WALLET'], required: true },
      status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'], default: 'PENDING' },
      transactionId: { type: String },
    },

    // Required only for DELIVERY orders; null for PICKUP
    deliveryAddress: { type: addressPointSchema, default: null },

    pickupAddress: { type: addressPointSchema, required: true },
  },
  { timestamps: true }
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, status: 1 });
orderSchema.index({ rider: 1, status: 1 });
orderSchema.index({ status: 1, orderType: 1 });

// Automatically append to statusHistory when status changes
orderSchema.pre('save', function () {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
    });
  }
});

module.exports = mongoose.model('Order', orderSchema);