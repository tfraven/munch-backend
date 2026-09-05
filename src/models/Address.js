const mongoose = require('mongoose');

// Standalone Address collection, owned by either a CustomerProfile (many
// addresses) or a VendorProfile (one address). Polymorphic owner via
// refPath, same pattern as Location.
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home', trim: true },
    addressLine: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    isDefault: { type: Boolean, default: false },
    ownerType: { type: String, required: true, enum: ['CustomerProfile', 'VendorProfile'] },
    owner: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'ownerType' },
  },
  { timestamps: true }
);

addressSchema.index({ owner: 1, ownerType: 1 });

// Enforce at most one isDefault address per owner.
addressSchema.pre('save', async function () {
  if (this.isModified('isDefault') && this.isDefault) {
    await this.constructor.updateMany(
      { owner: this.owner, ownerType: this.ownerType, _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
});

module.exports = mongoose.model('Address', addressSchema);