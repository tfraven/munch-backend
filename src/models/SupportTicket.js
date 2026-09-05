const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      required: true,
      enum: ['MISSING_ITEM', 'WRONG_ORDER', 'LATE_DELIVERY', 'QUALITY_ISSUE', 'OTHER'],
    },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'],
      default: 'OPEN',
    },
    resolutionNotes: { type: String },
  },
  { timestamps: true }
);

supportTicketSchema.index({ order: 1 });
supportTicketSchema.index({ createdBy: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);