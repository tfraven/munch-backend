const mongoose = require('mongoose');

const User = require('../models/User');
const VendorProfile = require('../models/VendorProfile');
const RiderProfile = require('../models/RiderProfile');
const CustomerProfile = require('../models/CustomerProfile');
const VendorRegistrationRequest = require('../models/VendorRegistrationRequest');
const Address = require('../models/Address');
const Location = require('../models/Location');
const Order = require('../models/Order');

const { handleControllerError } = require('./utils/errorHandler');

/**
 * GET ALL VENDOR REGISTRATION REQUESTS
 */
const getVendorRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      filter.status = status.toUpperCase();
    }

    const requests = await VendorRegistrationRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'username');

    return res.status(200).json({ count: requests.length, requests });
  } catch (error) {
    return handleControllerError(res, error, 'GetVendorRequests');
  }
};

/**
 * REVIEW (APPROVE OR REJECT) VENDOR REGISTRATION REQUEST
 */
const reviewVendorRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { action, rejectionReason, temporaryPassword } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action?.toUpperCase())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Action must be either APPROVE or REJECT.' });
    }

    const requestDoc = await VendorRegistrationRequest.findById(id).session(session);
    if (!requestDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Vendor registration request not found.' });
    }

    if (requestDoc.status !== 'PENDING') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: `Request has already been ${requestDoc.status.toLowerCase()}.` });
    }

    if (action.toUpperCase() === 'REJECT') {
      requestDoc.status = 'REJECTED';
      requestDoc.rejectionReason = rejectionReason || 'Application declined by administrator.';
      requestDoc.reviewedBy = req.user._id;
      requestDoc.reviewedAt = new Date();
      await requestDoc.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        message: 'Vendor registration request rejected.',
        request: requestDoc,
      });
    }

    // APPROVE FLOW
    // Generate username from storeName
    const baseUsername = requestDoc.storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let finalUsername = baseUsername || 'vendor';
    let counter = 1;
    while (await User.findOne({ username: finalUsername }).session(session)) {
      finalUsername = `${baseUsername}${counter}`;
      counter++;
    }

    const passwordToUse = temporaryPassword || 'Vendor@123';

    // 1. Create User
    const newUser = new User({
      username: finalUsername,
      password: passwordToUse,
      role: 'vendor',
      isActive: true,
    });
    await newUser.save({ session });

    // 2. Create Address & Location
    const vendorProfileId = new mongoose.Types.ObjectId();

    const addressDoc = new Address({
      label: 'Store',
      addressLine: requestDoc.address.addressLine,
      city: requestDoc.address.city,
      owner: vendorProfileId,
      ownerType: 'VendorProfile',
      isDefault: true,
    });

    if (requestDoc.address?.location?.coordinates) {
      const locationDoc = new Location({
        coordinates: requestDoc.address.location.coordinates,
        owner: addressDoc._id,
        ownerType: 'Address',
      });
      await locationDoc.save({ session });
      addressDoc.location = locationDoc._id;
    }

    await addressDoc.save({ session });

    // 3. Create VendorProfile
    const newVendorProfile = new VendorProfile({
      _id: vendorProfileId,
      user: newUser._id,
      storeName: requestDoc.storeName,
      email: requestDoc.email,
      phone: requestDoc.phone,
      cuisineTypes: requestDoc.cuisineTypes,
      deliveryOption: requestDoc.deliveryOption || 'PLATFORM_RIDERS',
      description: requestDoc.description,
      address: addressDoc._id,
      location: {
        type: 'Point',
        coordinates: requestDoc.address.location.coordinates,
      },
      isVerified: true,
      isAcceptingOrders: true,
      registrationRequest: requestDoc._id,
    });
    await newVendorProfile.save({ session });

    // 4. Update Registration Request
    requestDoc.status = 'APPROVED';
    requestDoc.reviewedBy = req.user._id;
    requestDoc.reviewedAt = new Date();
    requestDoc.createdUser = newUser._id;
    requestDoc.createdVendorProfile = newVendorProfile._id;
    await requestDoc.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: 'Vendor request approved. Vendor account created successfully.',
      vendor: {
        profileId: newVendorProfile._id,
        storeName: newVendorProfile.storeName,
        username: newUser.username,
        email: newVendorProfile.email,
        temporaryPassword: passwordToUse,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return handleControllerError(res, error, 'ReviewVendorRequest');
  }
};

/**
 * DIRECTLY CREATE A VENDOR (Admin)
 */
const createVendorDirectly = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      username,
      password,
      storeName,
      email,
      phone,
      cuisineTypes,
      deliveryOption,
      address,
      description,
      minOrderAmount,
      prepTimeMinutes,
    } = req.body;

    if (!username || !password || !storeName || !email || !phone || !address || !address.addressLine || !address.city) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Username, password, storeName, email, phone, and complete address are required.',
      });
    }

    if (!address.location?.coordinates || address.location.coordinates.length !== 2) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Valid coordinates [longitude, latitude] are required for vendor store.',
      });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: 'Username is already in use.' });
    }

    const existingProfile = await VendorProfile.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    }).session(session);
    if (existingProfile) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: 'Email or phone is already registered with another vendor.' });
    }

    const newUser = new User({
      username: username.toLowerCase(),
      password,
      role: 'vendor',
      isActive: true,
    });
    await newUser.save({ session });

    const vendorProfileId = new mongoose.Types.ObjectId();

    const addressDoc = new Address({
      label: 'Store',
      addressLine: address.addressLine,
      city: address.city,
      owner: vendorProfileId,
      ownerType: 'VendorProfile',
      isDefault: true,
    });

    const locationDoc = new Location({
      coordinates: address.location.coordinates,
      owner: addressDoc._id,
      ownerType: 'Address',
    });
    await locationDoc.save({ session });
    addressDoc.location = locationDoc._id;
    await addressDoc.save({ session });

    const newVendorProfile = new VendorProfile({
      _id: vendorProfileId,
      user: newUser._id,
      storeName,
      email: email.toLowerCase(),
      phone,
      cuisineTypes: cuisineTypes || [],
      deliveryOption: deliveryOption || 'PLATFORM_RIDERS',
      description,
      minOrderAmount: minOrderAmount || 0,
      prepTimeMinutes: prepTimeMinutes || 20,
      address: addressDoc._id,
      location: {
        type: 'Point',
        coordinates: address.location.coordinates,
      },
      isVerified: true,
      isAcceptingOrders: true,
    });
    await newVendorProfile.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: 'Vendor created directly by admin successfully.',
      vendor: {
        profileId: newVendorProfile._id,
        storeName: newVendorProfile.storeName,
        username: newUser.username,
        email: newVendorProfile.email,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return handleControllerError(res, error, 'CreateVendorDirectly');
  }
};

/**
 * GET RIDERS PENDING VERIFICATION
 */
const getPendingRiders = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      filter.verificationStatus = status.toUpperCase();
    } else {
      filter.verificationStatus = 'PENDING';
    }

    const riders = await RiderProfile.find(filter)
      .populate('user', 'username isActive')
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: riders.length, riders });
  } catch (error) {
    return handleControllerError(res, error, 'GetPendingRiders');
  }
};

/**
 * VERIFY RIDER (Approve / Reject)
 */
const verifyRider = async (req, res) => {
  try {
    const { id } = req.params; // RiderProfile ID
    const { action, rejectionReason } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action?.toUpperCase())) {
      return res.status(400).json({ message: 'Action must be either APPROVE or REJECT.' });
    }

    const rider = await RiderProfile.findById(id);
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found.' });
    }

    const isApproved = action.toUpperCase() === 'APPROVE';

    rider.verificationStatus = isApproved ? 'APPROVED' : 'REJECTED';
    rider.isVerified = isApproved;
    rider.rejectionReason = isApproved ? undefined : (rejectionReason || 'Documents did not meet criteria.');
    rider.verifiedAt = new Date();
    rider.verifiedBy = req.user._id;

    await rider.save();

    return res.status(200).json({
      message: isApproved ? 'Rider verification approved successfully.' : 'Rider verification rejected.',
      rider,
    });
  } catch (error) {
    return handleControllerError(res, error, 'VerifyRider');
  }
};

/**
 * GET ALL VENDORS
 */
const getAllVendors = async (req, res) => {
  try {
    const vendors = await VendorProfile.find()
      .populate('user', 'username isActive')
      .populate('address')
      .populate('dedicatedRiders', 'firstName lastName phone vehicle isOnline isAvailable')
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: vendors.length, vendors });
  } catch (error) {
    return handleControllerError(res, error, 'GetAllVendors');
  }
};

/**
 * GET ALL RIDERS
 */
const getAllRiders = async (req, res) => {
  try {
    const riders = await RiderProfile.find()
      .populate('user', 'username isActive')
      .populate('employerVendor', 'storeName phone')
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: riders.length, riders });
  } catch (error) {
    return handleControllerError(res, error, 'GetAllRiders');
  }
};

/**
 * TOGGLE USER ACTIVE STATUS (Ban / Unban)
 */
const toggleUserActiveStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean flag is required.' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isActive } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({
      message: `User account has been ${isActive ? 'activated' : 'deactivated'}.`,
      user,
    });
  } catch (error) {
    return handleControllerError(res, error, 'ToggleUserActiveStatus');
  }
};

/**
 * PLATFORM ANALYTICS DASHBOARD
 */
const getPlatformAnalytics = async (req, res) => {
  try {
    const [
      totalUsers,
      totalVendors,
      totalRiders,
      totalCustomers,
      totalOrders,
      ordersByStatus,
      ordersByType,
      revenueResult,
    ] = await Promise.all([
      User.countDocuments(),
      VendorProfile.countDocuments({ isVerified: true }),
      RiderProfile.countDocuments({ isVerified: true }),
      CustomerProfile.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $group: { _id: '$orderType', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: 'DELIVERED' } },
        { $group: { _id: null, totalGross: { $sum: '$pricing.total' }, totalDeliveryFees: { $sum: '$pricing.deliveryFee' } } },
      ]),
    ]);

    const grossSales = revenueResult[0]?.totalGross || 0;
    const grossDeliveryFees = revenueResult[0]?.totalDeliveryFees || 0;

    return res.status(200).json({
      analytics: {
        users: {
          total: totalUsers,
          vendors: totalVendors,
          riders: totalRiders,
          customers: totalCustomers,
        },
        orders: {
          total: totalOrders,
          byStatus: ordersByStatus.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
          byType: ordersByType.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
        },
        financials: {
          grossCompletedSales: Math.round(grossSales * 100) / 100,
          totalDeliveryFees: Math.round(grossDeliveryFees * 100) / 100,
        },
      },
    });
  } catch (error) {
    return handleControllerError(res, error, 'GetPlatformAnalytics');
  }
};

module.exports = {
  getVendorRequests,
  reviewVendorRequest,
  createVendorDirectly,
  getPendingRiders,
  verifyRider,
  getAllVendors,
  getAllRiders,
  toggleUserActiveStatus,
  getPlatformAnalytics,
};
