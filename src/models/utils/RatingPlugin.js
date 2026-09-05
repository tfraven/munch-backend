/**
 * Adds a derived-rating pattern to a schema instead of a single raw,
 * directly-settable `rating` field.
 *
 * - ratingSum / ratingCount are the only stored values.
 * - avgRating is a virtual computed from them (never stored, never stale).
 * - recalculateRating(delta) is a static helper a Review model's
 *   post-save/post-remove hook should call, e.g.:
 *     await VendorProfile.recalculateRating(vendorId, newScore);
 *
 * This keeps "rating" from being blindly overwritten by a stray
 * `updateOne({ rating: 5 })` somewhere in the app.
 */
function applyRatingFields(schema) {
  schema.add({
    ratingSum: { type: Number, default: 0, min: 0 },
    ratingCount: { type: Number, default: 0, min: 0 },
  });

  schema.virtual('avgRating').get(function () {
    if (!this.ratingCount) return 0;
    return Math.round((this.ratingSum / this.ratingCount) * 10) / 10; // 1 decimal
  });

  schema.set('toJSON', { virtuals: true });
  schema.set('toObject', { virtuals: true });

  schema.statics.recalculateRating = async function (docId, newScore) {
    if (newScore < 0 || newScore > 5) {
      throw new Error('newScore must be between 0 and 5');
    }
    return this.findByIdAndUpdate(
      docId,
      { $inc: { ratingSum: newScore, ratingCount: 1 } },
      { new: true }
    );
  };
}

module.exports = applyRatingFields;