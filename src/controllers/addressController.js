const CustomerProfile = require('../models/CustomerProfile');
const VendorProfile = require('../models/VendorProfile');
const Address = require('../models/Address');
const Location = require('../models/Location');

const { handleControllerError } = require('./utils/errorHandler');

// Resolves the calling user's own profile as an Address owner. Every
// mutating endpoint below re-derives ownership from req.user (never trusts
// an ownerId from the request body) to prevent one user editing another's
// address by guessing an addressId.
const resolveOwner = async (user) => {
  if (user.role === 'customer') {
    const profile = await CustomerProfile.findOne({ user: user._id });
    return profile ? { ownerType: 'CustomerProfile', ownerId: profile._id } : null;
  }
  if (user.role === 'vendor') {
    const profile = await VendorProfile.findOne({ user: user._id });
    return profile ? { ownerType: 'VendorProfile', ownerId: profile._id } : null;
  }
  return null;
};

const upsertLocationForAddress = async (addressId, coordinates, existingLocationId) => {
  if (existingLocationId) {
    return Location.findByIdAndUpdate(
      existingLocationId,
      { $set: { coordinates } },
      { new: true, runValidators: true }
    );
  }
  const locationDoc = new Location({ coordinates, owner: addressId, ownerType: 'Address' });
  await locationDoc.save();
  return locationDoc;
};

// --- Customer: multiple saved addresses ---

const listMyAddresses = async (req, res) => {
  try {
    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ message: 'Profile not found.' });

    const addresses = await Address.find({ owner: owner.ownerId, ownerType: owner.ownerType }).populate('location');
    return res.status(200).json({ addresses });
  } catch (error) {
    return handleControllerError(res, error, 'ListMyAddresses');
  }
};

const addAddress = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can add multiple addresses.' });
    }

    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ message: 'Profile not found.' });

    const { label, addressLine, city, isDefault, location } = req.body;
    if (!addressLine || !city) {
      return res.status(400).json({ message: 'addressLine and city are required.' });
    }

    const addressDoc = new Address({
      label,
      addressLine,
      city,
      isDefault: !!isDefault,
      owner: owner.ownerId,
      ownerType: owner.ownerType,
    });

    if (location?.coordinates) {
      const locationDoc = await upsertLocationForAddress(addressDoc._id, location.coordinates, null);
      addressDoc.location = locationDoc._id;
    }

    // .save() (not findOneAndUpdate) so the pre-save single-default hook runs.
    await addressDoc.save();

    return res.status(201).json({ message: 'Address added.', address: addressDoc });
  } catch (error) {
    return handleControllerError(res, error, 'AddAddress');
  }
};

// --- Shared: update/delete a specific address, owner-checked ---

const updateAddress = async (req, res) => {
  try {
    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ message: 'Profile not found.' });

    const addressDoc = await Address.findById(req.params.addressId);
    if (!addressDoc) return res.status(404).json({ message: 'Address not found.' });

    const isOwner =
      addressDoc.owner.toString() === owner.ownerId.toString() && addressDoc.ownerType === owner.ownerType;
    if (!isOwner) {
      return res.status(403).json({ message: 'You do not have permission to modify this address.' });
    }

    const { label, addressLine, city, isDefault, location } = req.body;
    if (label !== undefined) addressDoc.label = label;
    if (addressLine !== undefined) addressDoc.addressLine = addressLine;
    if (city !== undefined) addressDoc.city = city;
    if (isDefault !== undefined) addressDoc.isDefault = isDefault;

    if (location?.coordinates) {
      const locationDoc = await upsertLocationForAddress(addressDoc._id, location.coordinates, addressDoc.location);
      addressDoc.location = locationDoc._id;
    }

    // .save() so the single-default enforcement hook actually runs — a
    // findByIdAndUpdate here would silently skip it.
    await addressDoc.save();

    return res.status(200).json({ message: 'Address updated.', address: addressDoc });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateAddress');
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers have multiple addresses to default among.' });
    }

    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ message: 'Profile not found.' });

    const addressDoc = await Address.findById(req.params.addressId);
    if (!addressDoc || addressDoc.owner.toString() !== owner.ownerId.toString()) {
      return res.status(404).json({ message: 'Address not found.' });
    }

    addressDoc.isDefault = true;
    await addressDoc.save(); // triggers the pre-save hook that unsets other defaults

    return res.status(200).json({ message: 'Default address updated.', address: addressDoc });
  } catch (error) {
    return handleControllerError(res, error, 'SetDefaultAddress');
  }
};

const deleteAddress = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Vendor address cannot be deleted, only updated.' });
    }

    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ message: 'Profile not found.' });

    const addressDoc = await Address.findById(req.params.addressId);
    if (!addressDoc || addressDoc.owner.toString() !== owner.ownerId.toString()) {
      return res.status(404).json({ message: 'Address not found.' });
    }

    if (addressDoc.location) {
      await Location.findByIdAndDelete(addressDoc.location); // avoid orphaned Location doc
    }
    await addressDoc.deleteOne();

    return res.status(200).json({ message: 'Address deleted.' });
  } catch (error) {
    return handleControllerError(res, error, 'DeleteAddress');
  }
};

module.exports = { listMyAddresses, addAddress, updateAddress, setDefaultAddress, deleteAddress };