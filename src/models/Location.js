const mongoose = require('mongoose');

// Standalone Location collection. Polymorphic owner (via ownerType/owner +
// refPath) so any model that needs a point (Address, RiderProfile, ...) can
// reference one, instead of every model embedding its own copy of the
// coordinate-validation logic.
//
// Trade-off vs embedding: geo queries against Address or RiderProfile now
// need an aggregation $lookup into this collection, since a 2dsphere index
// only accelerates queries run directly against the indexed collection.
// Worth it if you want location updates/history tracked independently of
// the owning document (e.g. riders pinging location every few seconds
// without rewriting the whole RiderProfile).
const locationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (arr) {
          if (!Array.isArray(arr) || arr.length !== 2) return false;
          const [lng, lat] = arr;
          return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
        },
        message: 'coordinates must be [longitude, latitude] within valid ranges',
      },
    },
    ownerType: { type: String, required: true, enum: ['Address', 'RiderProfile'] },
    owner: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'ownerType' },
  },
  { timestamps: true } // updatedAt doubles as "location last updated at"
);

locationSchema.index({ coordinates: '2dsphere' });
locationSchema.index({ owner: 1 }, { unique: true }); // one location doc per owner

// Upsert-style setter: updates in place instead of creating a new document
// on every ping (important for RiderProfile, whose location changes often).
locationSchema.statics.setFor = async function (ownerType, ownerId, coordinates) {
  return this.findOneAndUpdate(
    { ownerType, owner: ownerId },
    { $set: { coordinates, type: 'Point' } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('Location', locationSchema);