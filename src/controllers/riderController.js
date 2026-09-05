const mongoose = require('mongoose');

const RiderProfile = require('../models/RiderProfile');
const Location = require('../models/Location');
const Order = require('../models/Order');

const { handleControllerError } = require('./utils/errorHandler');
const { emitOrderUpdate, emitRiderLocationToOrder } = require('../utils/socket');
const { calculateDistanceKm } = require('../utils/geo');

const getRiderProfileForUser = async (userId) => {
  return await RiderProfile.findOne({ user: userId });
};

/**
 * GET RIDER PROFILE
 */
const getRiderProfile = async (req, res) => {
  try {
    const rider = await RiderProfile.findOne({ user: req.user._id })
      .populate('employerVendor', 'storeName phone address')
      .populate('currentOrder');

    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    return res.status(200).json({ rider });
  } catch (error) {
    return handleControllerError(res, error, 'GetRiderProfile');
  }
};

/**
 * SUBMIT / UPDATE VERIFICATION DOCUMENTS
 */
const submitVerificationDocuments = async (req, res) => {
  try {
    const { documents } = req.body; // Array of { docType, docNumber, docUrl }
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: 'At least one verification document is required.' });
    }

    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    rider.documents = documents;
    rider.verificationStatus = 'PENDING';
    rider.isVerified = false;
    rider.rejectionReason = undefined;

    await rider.save();

    return res.status(200).json({
      message: 'Verification documents submitted successfully. Please wait for admin review.',
      rider,
    });
  } catch (error) {
    return handleControllerError(res, error, 'SubmitVerificationDocuments');
  }
};

/**
 * UPDATE VEHICLE DETAILS
 */
const updateVehicle = async (req, res) => {
  try {
    const { type, licensePlate, model, color } = req.body;
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    if (type) rider.vehicle.type = type;
    if (licensePlate) rider.vehicle.licensePlate = licensePlate.toUpperCase();
    if (model) rider.vehicle.model = model;
    if (color) rider.vehicle.color = color;

    await rider.save();

    return res.status(200).json({ message: 'Vehicle details updated.', vehicle: rider.vehicle });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateVehicle');
  }
};

/**
 * TOGGLE ONLINE & AVAILABILITY STATUS
 */
const updateAvailability = async (req, res) => {
  try {
    const { isOnline, isAvailable } = req.body;
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    if (!rider.isVerified && isOnline === true) {
      return res.status(403).json({
        message: 'Cannot go online until your rider account and documents have been verified by an admin.',
      });
    }

    if (typeof isOnline === 'boolean') {
      rider.isOnline = isOnline;
      if (!isOnline) {
        rider.isAvailable = false;
      }
    }

    if (typeof isAvailable === 'boolean' && rider.isOnline) {
      rider.isAvailable = isAvailable;
    }

    await rider.save();

    return res.status(200).json({
      message: `Rider is now ${rider.isOnline ? 'ONLINE' : 'OFFLINE'} and ${rider.isAvailable ? 'AVAILABLE' : 'BUSY'}.`,
      isOnline: rider.isOnline,
      isAvailable: rider.isAvailable,
    });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateAvailability');
  }
};

/**
 * UPDATE LIVE GPS LOCATION (CRUCIAL FOR IN-APP MAP UI)
 * Rider app pings this endpoint periodically (e.g. every 5-10 seconds)
 */
const updateLocation = async (req, res) => {
  try {
    const { coordinates, heading, speed } = req.body;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ message: 'coordinates [longitude, latitude] are required.' });
    }

    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    rider.location = {
      type: 'Point',
      coordinates,
    };
    if (heading !== undefined) rider.heading = Number(heading);
    if (speed !== undefined) rider.speed = Number(speed);
    rider.lastLocationUpdate = new Date();

    await Promise.all([
      rider.save(),
      Location.setFor('RiderProfile', rider._id, coordinates),
    ]);

    // If rider is delivering an active order, emit live location ping to customer's order map room
    if (rider.currentOrder) {
      emitRiderLocationToOrder(rider.currentOrder.toString(), {
        riderId: rider._id,
        firstName: rider.firstName,
        phone: rider.phone,
        coordinates,
        heading: rider.heading,
        speed: rider.speed,
        updatedAt: rider.lastLocationUpdate,
      });
    }

    return res.status(200).json({
      message: 'Location updated.',
      location: rider.location,
      heading: rider.heading,
      speed: rider.speed,
      updatedAt: rider.lastLocationUpdate,
    });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateLocation');
  }
};

/**
 * GET AVAILABLE ORDERS FOR RIDER
 * - If rider is dedicated to a vendor: returns ready delivery orders from that vendor.
 * - If rider is platform rider: returns broadcasted ready delivery orders within proximity.
 */
const getAvailableOrders = async (req, res) => {
  try {
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    if (!rider.isVerified) {
      return res.status(403).json({ message: 'Rider must be verified to view available orders.' });
    }

    const query = {
      orderType: 'DELIVERY',
      status: 'READY_FOR_PICKUP',
      rider: null,
    };

    if (rider.employerVendor) {
      // Dedicated rider: sees orders from their employer store
      query.vendor = rider.employerVendor;
      query.dispatchType = { $in: ['VENDOR_FLEET', 'PLATFORM_BROADCAST'] };
    } else {
      // Platform pool rider: sees broadcast orders
      query.dispatchType = 'PLATFORM_BROADCAST';
    }

    const orders = await Order.find(query)
      .populate('vendor', 'storeName phone address location')
      .populate('customer', 'firstName lastName phone')
      .sort({ createdAt: -1 });

    // Calculate rider's distance to vendor store if rider coordinates are available
    const ordersWithDistance = orders.map((order) => {
      const orderObj = order.toObject();
      if (rider.location?.coordinates && orderObj.pickupAddress?.location?.coordinates) {
        orderObj.distanceToStoreKm = calculateDistanceKm(
          rider.location.coordinates,
          orderObj.pickupAddress.location.coordinates
        );
      }
      return orderObj;
    });

    return res.status(200).json({ count: ordersWithDistance.length, orders: ordersWithDistance });
  } catch (error) {
    return handleControllerError(res, error, 'GetAvailableOrders');
  }
};

/**
 * CLAIM ORDER (ATOMIC FIRST-COME-FIRST-SERVED ACCEPTANCE)
 */
const claimOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    if (!rider.isVerified) {
      return res.status(403).json({ message: 'Only verified riders can claim orders.' });
    }

    if (!rider.isOnline) {
      return res.status(400).json({ message: 'You must go online before claiming orders.' });
    }

    if (rider.currentOrder) {
      return res.status(400).json({ message: 'You already have an active order in progress. Complete it first.' });
    }

    const query = {
      _id: id,
      orderType: 'DELIVERY',
      status: 'READY_FOR_PICKUP',
      rider: null,
    };

    // If dedicated, check vendor restriction
    if (rider.employerVendor) {
      // Dedicated rider can claim their vendor's fleet order or any broadcast order
    } else {
      // Platform rider can only claim broadcast orders
      query.dispatchType = 'PLATFORM_BROADCAST';
    }

    // Atomic claim so no two riders can grab the same order
    const claimedOrder = await Order.findOneAndUpdate(
      query,
      {
        $set: {
          rider: rider._id,
          status: 'RIDER_ASSIGNED',
        },
      },
      { new: true }
    )
      .populate('vendor', 'storeName phone address location')
      .populate('customer', 'firstName lastName phone');

    if (!claimedOrder) {
      return res.status(409).json({
        message: 'Order is no longer available. Another rider may have accepted it first.',
      });
    }

    // Update rider state
    rider.currentOrder = claimedOrder._id;
    rider.isAvailable = false;
    await rider.save();

    emitOrderUpdate(claimedOrder._id, claimedOrder);

    return res.status(200).json({
      message: 'Order claimed successfully. Head to the store for pickup!',
      order: claimedOrder,
    });
  } catch (error) {
    return handleControllerError(res, error, 'ClaimOrder');
  }
};

/**
 * GET ACTIVE ORDER
 */
const getActiveOrder = async (req, res) => {
  try {
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    if (!rider.currentOrder) {
      return res.status(200).json({ message: 'No active order.', order: null });
    }

    const order = await Order.findById(rider.currentOrder)
      .populate('vendor', 'storeName phone address location')
      .populate('customer', 'firstName lastName phone');

    return res.status(200).json({ order });
  } catch (error) {
    return handleControllerError(res, error, 'GetActiveOrder');
  }
};

/**
 * MARK ARRIVED AT VENDOR
 */
const markArrivedAtVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    const order = await Order.findOne({ _id: id, rider: rider._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.status !== 'RIDER_ASSIGNED') {
      return res.status(400).json({ message: `Cannot mark arrived from status ${order.status}.` });
    }

    order.status = 'RIDER_ARRIVED_AT_VENDOR';
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Arrived at vendor store.', order });
  } catch (error) {
    return handleControllerError(res, error, 'MarkArrivedAtVendor');
  }
};

/**
 * CONFIRM PICKUP FROM STORE (START DRIVING TO CUSTOMER)
 */
const pickupOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    const order = await Order.findOne({ _id: id, rider: rider._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (!['RIDER_ASSIGNED', 'RIDER_ARRIVED_AT_VENDOR'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot pick up order in state ${order.status}.` });
    }

    order.status = 'OUT_FOR_DELIVERY';
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Order picked up. On the way to customer!', order });
  } catch (error) {
    return handleControllerError(res, error, 'PickupOrder');
  }
};

/**
 * DELIVER ORDER TO CUSTOMER (COMPLETION WITH OTP)
 */
const deliverOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryOtp } = req.body;

    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    const order = await Order.findOne({ _id: id, rider: rider._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({ message: `Order cannot be completed from state ${order.status}.` });
    }

    // Validate delivery OTP if set
    if (order.deliveryOtp && order.deliveryOtp !== deliveryOtp) {
      return res.status(400).json({ message: 'Invalid customer delivery PIN/OTP.' });
    }

    order.status = 'DELIVERED';
    if (order.payment.method === 'CASH_ON_DELIVERY') {
      order.payment.status = 'COMPLETED';
    }
    await order.save();

    // Release rider for next deliveries
    rider.currentOrder = null;
    rider.isAvailable = true;
    await rider.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({
      message: 'Order successfully delivered! Delivery complete.',
      order,
    });
  } catch (error) {
    return handleControllerError(res, error, 'DeliverOrder');
  }
};

/**
 * GET RIDER EARNINGS AND COMPLETED DELIVERIES
 */
const getRiderEarnings = async (req, res) => {
  try {
    const rider = await getRiderProfileForUser(req.user._id);
    if (!rider) return res.status(404).json({ message: 'Rider profile not found.' });

    const completedOrders = await Order.find({
      rider: rider._id,
      status: 'DELIVERED',
    }).sort({ updatedAt: -1 });

    const totalDeliveries = completedOrders.length;
    const totalEarnings = completedOrders.reduce((sum, ord) => sum + (ord.pricing.deliveryFee || 0), 0);

    return res.status(200).json({
      totalDeliveries,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      completedOrders,
    });
  } catch (error) {
    return handleControllerError(res, error, 'GetRiderEarnings');
  }
};

module.exports = {
  getRiderProfile,
  submitVerificationDocuments,
  updateVehicle,
  updateAvailability,
  updateLocation,
  getAvailableOrders,
  claimOrder,
  getActiveOrder,
  markArrivedAtVendor,
  pickupOrder,
  deliverOrder,
  getRiderEarnings,
};
