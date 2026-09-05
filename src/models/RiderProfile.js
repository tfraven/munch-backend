const mongoose = require('mongoose');
const applyRatingFields = require('./utils/RatingPlugin');

const coordinateValidator = {
  validator: function (arr) {
    if (!arr) return true;
    if (!Array.isArray(arr) || arr.length !== 2) return false;
    const [lng, lat] = arr;
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  },
  message: 'Coordinates must be [longitude, latitude] within valid bounds.',
};

const verificationDocSchema = new mongoose.Schema(
  {
    docType: {
      type: String,
      enum: ['CNIC_OR_ID', 'DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'OTHER'],
      required: true,
    },
    docNumber: { type: String, trim: true },
    docUrl: { type: String, required: true, trim: true },
  },
  { _id: true, timestamps: true }
);

const riderProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },

    vehicle: {
      type: { type: String, enum: ['bike', 'motorcycle', 'car', 'scooter'], required: true },
      licensePlate: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
      },
      model: { type: String, trim: true },
      color: { type: String, trim: true },
    },

    // Documents uploaded by the rider for admin approval
    documents: [verificationDocSchema],

    verificationStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    rejectionReason: { type: String, trim: true },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    isVerified: { type: Boolean, default: false }, // Syncs with verificationStatus === 'APPROVED'

    // If employed/dedicated to a specific vendor
    employerVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', default: null },

    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: false },

    // Direct GeoJSON location for real-time tracking and proximity discovery
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0], validate: coordinateValidator },
    },
    heading: { type: Number, default: 0 }, // in degrees (0 - 360) for in-app map icon rotation
    speed: { type: Number, default: 0 },   // in km/h
    lastLocationUpdate: { type: Date, default: Date.now },

    // Legacy ref to Location collection if needed
    currentLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },

    currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  { timestamps: true }
);

riderProfileSchema.index({ location: '2dsphere' });
riderProfileSchema.index({ isOnline: 1, isAvailable: 1, isVerified: 1 });
riderProfileSchema.index({ employerVendor: 1 });

applyRatingFields(riderProfileSchema); // adds ratingSum, ratingCount, avgRating

module.exports = mongoose.model('RiderProfile', riderProfileSchema);