const mongoose = require('mongoose');

const coordinateValidator = {
  validator: function (arr) {
    if (!arr) return true;
    if (!Array.isArray(arr) || arr.length !== 2) return false;
    const [lng, lat] = arr;
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  },
  message: 'Coordinates must be [longitude, latitude] within valid bounds.',
};

const vendorRegistrationRequestSchema = new mongoose.Schema(
  {
    storeName: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    cuisineTypes: [{ type: String }],
    
    address: {
      addressLine: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true, validate: coordinateValidator },
      },
    },

    deliveryOption: {
      type: String,
      enum: ['PLATFORM_RIDERS', 'OWN_RIDERS', 'BOTH'],
      default: 'PLATFORM_RIDERS',
    },

    businessLicenseUrl: { type: String, trim: true },
    taxNumber: { type: String, trim: true },
    description: { type: String, trim: true },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    rejectionReason: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },

    // Populated once approved
    createdUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdVendorProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile' },
  },
  { timestamps: true }
);

vendorRegistrationRequestSchema.index({ status: 1, createdAt: -1 });
vendorRegistrationRequestSchema.index({ email: 1 });
vendorRegistrationRequestSchema.index({ phone: 1 });

module.exports = mongoose.model('VendorRegistrationRequest', vendorRegistrationRequestSchema);
