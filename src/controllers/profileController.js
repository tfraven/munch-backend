const User = require('../models/User');
const VendorProfile = require('../models/VendorProfile');
const RiderProfile = require('../models/RiderProfile');

const { getProfileModelByRole, getPopulateOptionsByRole } = require('./utils/roleHelpers');
const { handleControllerError } = require('./utils/errorHandler');

// Whitelist of fields a user may edit on their own profile via PATCH.
// Deliberately excludes: ratingSum/ratingCount/avgRating (derived, must go
// through Review hooks), isVerified (admin-only), address/currentLocation
// (handled by addressController/locationController so ownership + Location
// side effects stay in one place), isOnline/isAvailable (rider self-status,
// see updateRiderAvailability below).
const EDITABLE_FIELDS_BY_ROLE = {
  customer: ['firstName', 'lastName', 'email', 'phone'],
  vendor: ['storeName', 'email', 'phone', 'cuisineTypes', 'logoUrl', 'bannerUrl', 'isAcceptingOrders', 'businessHours'],
  rider: ['firstName', 'lastName', 'email', 'phone', 'vehicle'],
};

const getMyProfile = async (req, res) => {
  try {
    const ProfileModel = getProfileModelByRole(req.user.role);
    if (!ProfileModel) {
      return res.status(400).json({ message: 'No profile associated with this role.' });
    }

    const profile = await ProfileModel.findOne({ user: req.user._id }).populate(
      getPopulateOptionsByRole(req.user.role)
    );
    if (!profile) return res.status(404).json({ message: 'Profile not found.' });

    return res.status(200).json({ profile });
  } catch (error) {
    return handleControllerError(res, error, 'GetMyProfile');
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const role = req.user.role;
    const ProfileModel = getProfileModelByRole(role);
    if (!ProfileModel) {
      return res.status(400).json({ message: 'No profile associated with this role.' });
    }

    const allowedFields = EDITABLE_FIELDS_BY_ROLE[role] || [];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update.' });
    }

    if (updates.email) updates.email = updates.email.toLowerCase();

    // findOneAndUpdate (not fetch+save) is fine here: none of the editable
    // fields trigger the single-default-address hook or any other
    // save-only middleware, so runValidators is enough.
    const profile = await ProfileModel.findOneAndUpdate(
      { user: req.user._id },
      { $set: updates },
      { new: true, runValidators: true, context: 'query' }
    );

    if (!profile) return res.status(404).json({ message: 'Profile not found.' });

    return res.status(200).json({ message: 'Profile updated.', profile });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateMyProfile');
  }
};

// Rider toggles their own online/available status. Kept separate from
// updateMyProfile because these two booleans change far more often than the
// rest of the profile and have their own semantics (dispatch eligibility).
const updateRiderAvailability = async (req, res) => {
  try {
    if (req.user.role !== 'rider') {
      return res.status(403).json({ message: 'Only riders have availability status.' });
    }

    const { isOnline, isAvailable } = req.body;
    const updates = {};
    if (typeof isOnline === 'boolean') updates.isOnline = isOnline;
    if (typeof isAvailable === 'boolean') updates.isAvailable = isAvailable;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'isOnline and/or isAvailable (boolean) required.' });
    }

    const profile = await RiderProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updates },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Rider profile not found.' });

    return res.status(200).json({ message: 'Availability updated.', profile });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateRiderAvailability');
  }
};

// --- Admin-only actions. Mount these routes behind restrictTo('admin'). ---

const verifyVendor = async (req, res) => {
  try {
    const { vendorProfileId } = req.params;
    const profile = await VendorProfile.findByIdAndUpdate(
      vendorProfileId,
      { $set: { isVerified: true } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Vendor profile not found.' });
    return res.status(200).json({ message: 'Vendor verified.', profile });
  } catch (error) {
    return handleControllerError(res, error, 'VerifyVendor');
  }
};

const verifyRider = async (req, res) => {
  try {
    const { riderProfileId } = req.params;
    const profile = await RiderProfile.findByIdAndUpdate(
      riderProfileId,
      { $set: { isVerified: true } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Rider profile not found.' });
    return res.status(200).json({ message: 'Rider verified.', profile });
  } catch (error) {
    return handleControllerError(res, error, 'VerifyRider');
  }
};

const setUserActiveStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive (boolean) is required.' });
    }

    const user = await User.findByIdAndUpdate(userId, { $set: { isActive } }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    return res.status(200).json({ message: `User ${isActive ? 'activated' : 'deactivated'}.`, user });
  } catch (error) {
    return handleControllerError(res, error, 'SetUserActiveStatus');
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateRiderAvailability,
  verifyVendor,
  verifyRider,
  setUserActiveStatus,
};