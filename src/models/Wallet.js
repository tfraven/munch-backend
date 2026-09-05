const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    ownerType: { type: String, required: true, enum: ['VendorProfile', 'RiderProfile', 'CustomerProfile'] },
    owner: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'ownerType', unique: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);