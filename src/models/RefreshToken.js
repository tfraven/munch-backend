const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ user: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired docs

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);