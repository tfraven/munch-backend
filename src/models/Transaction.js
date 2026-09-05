const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD', uppercase: true },
    type: {
      type: String,
      required: true,
      enum: ['PAYMENT', 'REFUND', 'PAYOUT', 'ADJUSTMENT'],
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
    },
    paymentGateway: { type: String, enum: ['STRIPE', 'PAYPAL', 'COD', 'WALLET'] },
    gatewayTransactionId: { type: String },
    rawGatewayResponse: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

transactionSchema.index({ order: 1 });
transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);