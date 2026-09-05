const CustomerProfile = require('../../models/CustomerProfile');
const VendorProfile = require('../../models/VendorProfile');
const RiderProfile = require('../../models/RiderProfile');

const getProfileModelByRole = (role) => {
  switch (role) {
    case 'customer':
      return CustomerProfile;
    case 'vendor':
      return VendorProfile;
    case 'rider':
      return RiderProfile;
    default:
      return null;
  }
};

// Populate options per role so callers get usable nested data (addresses,
// location) instead of bare ObjectIds.
const getPopulateOptionsByRole = (role) => {
  switch (role) {
    case 'customer':
      return { path: 'savedAddresses', populate: { path: 'location' } };
    case 'vendor':
      return { path: 'address', populate: { path: 'location' } };
    case 'rider':
      return { path: 'currentLocation' };
    default:
      return null;
  }
};

module.exports = { getProfileModelByRole, getPopulateOptionsByRole };