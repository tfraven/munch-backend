const mongoose = require('mongoose');

const customerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    // NOTE: duplicated from User for read convenience. If User is the
    // source of truth for auth/contact info, keep these two in sync via
    // a service-layer update rather than editing them independently.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

// savedAddresses no longer lives here — it's the reverse side of
// Address.owner. Populate with:
//   CustomerProfile.findById(id).populate('savedAddresses')
customerProfileSchema.virtual('savedAddresses', {
  ref: 'Address',
  localField: '_id',
  foreignField: 'owner',
  // Address.ownerType also needs to match 'CustomerProfile'; mongoose
  // virtual populate doesn't support a second match condition inline, so
  // always create/query Address docs with ownerType: 'CustomerProfile'
  // at the service layer to keep this correct.
});

customerProfileSchema.set('toJSON', { virtuals: true });
customerProfileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CustomerProfile', customerProfileSchema);