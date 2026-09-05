const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', required: true },
    name: { type: String, required: true, trim: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.index({ vendor: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);