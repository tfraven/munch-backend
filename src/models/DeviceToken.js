const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, required: true, enum: ['ios', 'android', 'web'] },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ user: 1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);