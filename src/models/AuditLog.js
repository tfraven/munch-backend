const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g., "VERIFY_VENDOR", "DEACTIVATE_USER"
    targetType: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    changes: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);