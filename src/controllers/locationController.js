const RiderProfile = require('../models/RiderProfile');
const Location = require('../models/Location');

const { handleControllerError } = require('./utils/errorHandler');

// Rider pings their current position. Uses Location.setFor (upsert) so this
// can be called every few seconds without creating a new document each
// time — see models/Location.js.
const updateMyLocation = async (req, res) => {
  try {
    if (req.user.role !== 'rider') {
      return res.status(403).json({ message: 'Only riders report a live location.' });
    }

    const { coordinates } = req.body;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ message: 'coordinates must be [longitude, latitude].' });
    }

    const riderProfile = await RiderProfile.findOne({ user: req.user._id });
    if (!riderProfile) return res.status(404).json({ message: 'Rider profile not found.' });

    const locationDoc = await Location.setFor('RiderProfile', riderProfile._id, coordinates);

    // Only needs writing once — after the first ping, currentLocation
    // already points at the (now-updated-in-place) Location doc.
    if (!riderProfile.currentLocation || riderProfile.currentLocation.toString() !== locationDoc._id.toString()) {
      riderProfile.currentLocation = locationDoc._id;
      await riderProfile.save();
    }

    return res.status(200).json({ message: 'Location updated.', location: locationDoc });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateMyLocation');
  }
};

// Example nearby-riders lookup. This is the cost we flagged when Point was
// pulled out of RiderProfile into its own collection: geo-filtering has to
// happen in Location first (where the 2dsphere index lives), then the
// matching RiderProfiles are fetched by the resulting ids — an aggregation
// $lookup, not a single indexed query on RiderProfile directly.
const getNearbyAvailableRiders = async (req, res) => {
  try {
    const { longitude, latitude, maxDistanceMeters = 5000 } = req.query;
    if (longitude === undefined || latitude === undefined) {
      return res.status(400).json({ message: 'longitude and latitude query params are required.' });
    }

    const nearbyLocations = await Location.find({
      ownerType: 'RiderProfile',
      coordinates: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
          $maxDistance: Number(maxDistanceMeters),
        },
      },
    }).select('owner coordinates');

    const riderIds = nearbyLocations.map((loc) => loc.owner);

    const riders = await RiderProfile.find({
      _id: { $in: riderIds },
      isOnline: true,
      isAvailable: true,
    }).select('firstName lastName vehicle avgRating ratingCount currentLocation');

    return res.status(200).json({ riders });
  } catch (error) {
    return handleControllerError(res, error, 'GetNearbyAvailableRiders');
  }
};

module.exports = { updateMyLocation, getNearbyAvailableRiders };