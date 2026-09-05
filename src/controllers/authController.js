const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const CustomerProfile = require('../models/CustomerProfile');
const VendorProfile = require('../models/VendorProfile');
const RiderProfile = require('../models/RiderProfile');
const Address = require('../models/Address');
const Location = require('../models/Location');
const VendorRegistrationRequest = require('../models/VendorRegistrationRequest');

const { getProfileModelByRole, getPopulateOptionsByRole } = require('./utils/roleHelpers');
const { handleControllerError } = require('./utils/errorHandler');

/**
 * CUSTOMER / RIDER / USER REGISTER
 */
const register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { username, password, role, email, phone, ...additionalData } = req.body;

    if (!username || !password || !role || !email || !phone) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Username, password, role, email, and phone are required.',
      });
    }

    const normalizedRole = role.toLowerCase();

    // Prevent direct vendor self-registration without request flow unless explicitly allowed
    if (normalizedRole === 'vendor') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Vendors must register via the vendor registration request endpoint (/api/v1/auth/vendor-request) or be created by an Admin.',
      });
    }

    if (normalizedRole === 'admin') {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Admin accounts cannot be self-registered.' });
    }

    const ProfileModel = getProfileModelByRole(normalizedRole);
    if (!ProfileModel) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid role specified.' });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: 'Username is already taken.' });
    }

    const existingProfile = await ProfileModel.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    }).session(session);

    if (existingProfile) {
      await session.abortTransaction();
      session.endSession();
      const field = existingProfile.email === email.toLowerCase() ? 'Email' : 'Phone number';
      return res.status(409).json({ message: `${field} is already registered.` });
    }

    // Create User
    const newUser = new User({
      username: username.toLowerCase(),
      password,
      role: normalizedRole,
      isActive: true,
    });
    await newUser.save({ session });

    // Build Profile
    const profilePayload = {
      user: newUser._id,
      email: email.toLowerCase(),
      phone,
    };

    if (normalizedRole === 'customer') {
      if (!additionalData.firstName || !additionalData.lastName) {
        throw Object.assign(new Error('First name and last name are required for customer.'), { statusCode: 400 });
      }
      profilePayload.firstName = additionalData.firstName;
      profilePayload.lastName = additionalData.lastName;
    } else if (normalizedRole === 'rider') {
      if (!additionalData.firstName || !additionalData.lastName) {
        throw Object.assign(new Error('First name and last name are required for rider.'), { statusCode: 400 });
      }
      if (!additionalData.vehicle || !additionalData.vehicle.type || !additionalData.vehicle.licensePlate) {
        throw Object.assign(new Error('Vehicle type and license plate are required for rider registration.'), { statusCode: 400 });
      }
      profilePayload.firstName = additionalData.firstName;
      profilePayload.lastName = additionalData.lastName;
      profilePayload.vehicle = additionalData.vehicle;
      profilePayload.verificationStatus = 'PENDING';
      profilePayload.isVerified = false;
      profilePayload.isOnline = false;
      profilePayload.isAvailable = false;

      if (additionalData.documents && Array.isArray(additionalData.documents)) {
        profilePayload.documents = additionalData.documents;
      }
    }

    const newProfile = new ProfileModel(profilePayload);
    await newProfile.save({ session });

    await session.commitTransaction();
    session.endSession();

    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: normalizedRole === 'rider'
        ? 'Rider registration submitted. Please wait for admin verification of your documents before accepting delivery orders.'
        : 'Registration successful.',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        profile: newProfile,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return handleControllerError(res, error, 'Register');
  }
};

/**
 * VENDOR REGISTRATION REQUEST (Public Endpoint)
 * Stores want to partner up and submit request with location & store info
 */
const submitVendorRequest = async (req, res) => {
  try {
    const {
      storeName,
      ownerName,
      email,
      phone,
      cuisineTypes,
      address,
      deliveryOption,
      businessLicenseUrl,
      taxNumber,
      description,
    } = req.body;

    if (!storeName || !ownerName || !email || !phone || !address || !address.addressLine || !address.city) {
      return res.status(400).json({
        message: 'Store name, owner name, email, phone, and complete address are required.',
      });
    }

    if (!address.location || !Array.isArray(address.location.coordinates) || address.location.coordinates.length !== 2) {
      return res.status(400).json({
        message: 'Valid store coordinates [longitude, latitude] are required in address.location.coordinates.',
      });
    }

    // Check if email or phone already requested or registered
    const existingReq = await VendorRegistrationRequest.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
      status: 'PENDING',
    });

    if (existingReq) {
      return res.status(409).json({
        message: 'A pending vendor registration request with this email or phone already exists.',
      });
    }

    const existingVendor = await VendorProfile.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    });
    if (existingVendor) {
      return res.status(409).json({
        message: 'A registered vendor with this email or phone already exists.',
      });
    }

    const newRequest = new VendorRegistrationRequest({
      storeName,
      ownerName,
      email: email.toLowerCase(),
      phone,
      cuisineTypes: cuisineTypes || [],
      address: {
        addressLine: address.addressLine,
        city: address.city,
        location: {
          type: 'Point',
          coordinates: address.location.coordinates,
        },
      },
      deliveryOption: deliveryOption || 'PLATFORM_RIDERS',
      businessLicenseUrl,
      taxNumber,
      description,
      status: 'PENDING',
    });

    await newRequest.save();

    return res.status(201).json({
      message: 'Vendor registration request submitted successfully. The platform administrator will review your application.',
      request: newRequest,
    });
  } catch (error) {
    return handleControllerError(res, error, 'SubmitVendorRequest');
  }
};

/**
 * LOGIN CONTROLLER
 */
const login = async (req, res) => {
  try {
    const { loginIdentifier, username, email, phone, password } = req.body;
    const identifier = loginIdentifier || username || email || phone;

    if (!identifier || !password) {
      return res.status(400).json({
        message: 'Username, email, or phone, and password are required.',
      });
    }

    let user = await User.findOne({ username: identifier.toLowerCase() }).select('+password');

    if (!user) {
      const searchConditions = [
        { email: identifier.toLowerCase() },
        { phone: identifier },
      ];

      const [customer, vendor, rider] = await Promise.all([
        CustomerProfile.findOne({ $or: searchConditions }),
        VendorProfile.findOne({ $or: searchConditions }),
        RiderProfile.findOne({ $or: searchConditions }),
      ]);

      const foundProfile = customer || vendor || rider;
      if (foundProfile) {
        user = await User.findById(foundProfile.user).select('+password');
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const ProfileModel = getProfileModelByRole(user.role);
    const populateOptions = getPopulateOptionsByRole(user.role);
    const profile = ProfileModel
      ? await ProfileModel.findOne({ user: user._id }).populate(populateOptions)
      : null;

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        profile,
      },
    });
  } catch (error) {
    return handleControllerError(res, error, 'Login');
  }
};

/**
 * GET ME
 */
const getMe = async (req, res) => {
  try {
    const ProfileModel = getProfileModelByRole(req.user.role);
    const populateOptions = getPopulateOptionsByRole(req.user.role);
    const profile = ProfileModel
      ? await ProfileModel.findOne({ user: req.user._id }).populate(populateOptions)
      : null;

    return res.status(200).json({
      user: {
        id: req.user._id,
        username: req.user.username,
        role: req.user.role,
        isActive: req.user.isActive,
        profile,
      },
    });
  } catch (error) {
    return handleControllerError(res, error, 'GetMe');
  }
};

module.exports = {
  register,
  submitVendorRequest,
  login,
  getMe,
};