const mongoose = require('mongoose');

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    area: {
      type: { type: String, enum: ['Polygon'], default: 'Polygon', required: true },
      coordinates: {
        type: [[[Number]]], // Array of linear rings containing coordinate pairs [lng, lat]
        required: true,
      },
    },
  },
  { timestamps: true }
);

deliveryZoneSchema.index({ area: '2dsphere' });

module.exports = mongoose.model('DeliveryZone', deliveryZoneSchema);