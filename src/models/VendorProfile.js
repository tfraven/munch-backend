const mongoose = require('mongoose');
const applyRatingFields = require('./utils/RatingPlugin');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:MM", 24h

const dayHoursSchema = new mongoose.Schema(
  {
    openTime: { type: String, match: TIME_REGEX, default: '09:00' },
    closeTime: { type: String, match: TIME_REGEX, default: '23:00' },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false }
);

const CUISINE_TYPES = [
  'italian', 'chinese', 'indian', 'mexican', 'american',
  'japanese', 'thai', 'mediterranean', 'fast_food', 'dessert', 'beverages', 'bakery', 'other',
];

const coordinateValidator = {
  validator: function (arr) {
    if (!arr) return true;
    if (!Array.isArray(arr) || arr.length !== 2) return false;
    const [lng, lat] = arr;
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  },
  message: 'Coordinates must be [longitude, latitude] within valid bounds.',
};

const vendorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    storeName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },

    cuisineTypes: [{ type: String }],
    logoUrl: { type: String },
    bannerUrl: { type: String },
    isAcceptingOrders: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false }, // admin approval gate

    // Delivery Fleet configuration
    deliveryOption: {
      type: String,
      enum: ['PLATFORM_RIDERS', 'OWN_RIDERS', 'BOTH'],
      default: 'PLATFORM_RIDERS',
    },
    // Dedicated fleet linked to this store
    dedicatedRiders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RiderProfile' }],

    // Operational parameters
    prepTimeMinutes: { type: Number, default: 20, min: 5, max: 180 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    commissionRate: { type: Number, default: 15, min: 0, max: 100 }, // platform fee %

    // Reference to Address
    address: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true },

    // Direct GeoJSON point for 2dsphere fast proximity searches
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], validate: coordinateValidator },
    },

    businessHours: {
      Mon: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
      Tue: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
      Wed: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
      Thu: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
      Fri: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
      Sat: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
      Sun: { type: dayHoursSchema, default: () => ({ openTime: '09:00', closeTime: '23:00', isOpen: true }) },
    },

    registrationRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorRegistrationRequest' },
  },
  { timestamps: true }
);

vendorProfileSchema.index({ location: '2dsphere' });
vendorProfileSchema.index({ storeName: 'text', cuisineTypes: 'text' });
vendorProfileSchema.index({ isVerified: 1, isAcceptingOrders: 1 });

applyRatingFields(vendorProfileSchema); // adds ratingSum, ratingCount, avgRating

module.exports = mongoose.model('VendorProfile', vendorProfileSchema);