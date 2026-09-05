const mongoose = require('mongoose');

const VendorProfile = require('../models/VendorProfile');
const CustomerProfile = require('../models/CustomerProfile');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Address = require('../models/Address');
const Location = require('../models/Location');

const { handleControllerError } = require('./utils/errorHandler');
const {
  calculateDistanceKm,
  calculateDeliveryFee,
  estimateTotalDeliveryTimeMinutes,
} = require('../utils/geo');
const { notifyVendorNewOrder, emitOrderUpdate } = require('../utils/socket');

const getCustomerProfileForUser = async (userId) => {
  return await CustomerProfile.findOne({ user: userId });
};

/**
 * GET NEARBY VENDORS (STORES / RESTAURANTS)
 * Supports custom in-app map discovery & list view
 */
const getNearbyVendors = async (req, res) => {
  try {
    const { lat, lng, radiusKm = 15, cuisine, search } = req.query;

    const baseFilter = {
      isVerified: true,
      isAcceptingOrders: true,
    };

    if (cuisine) {
      baseFilter.cuisineTypes = { $in: [cuisine.toLowerCase()] };
    }

    if (search) {
      baseFilter.storeName = { $regex: search, $options: 'i' };
    }

    let vendors;
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;

    if (userLat !== null && userLng !== null) {
      // Geospatial query using 2dsphere index on vendor.location
      const maxDistanceMeters = parseFloat(radiusKm) * 1000;

      vendors = await VendorProfile.find({
        ...baseFilter,
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [userLng, userLat],
            },
            $maxDistance: maxDistanceMeters,
          },
        },
      })
        .populate('address')
        .select('-dedicatedRiders');
    } else {
      vendors = await VendorProfile.find(baseFilter)
        .populate('address')
        .select('-dedicatedRiders')
        .limit(30);
    }

    // Attach calculated distance for each vendor
    const results = vendors.map((v) => {
      const vendorObj = v.toObject();
      if (userLat !== null && userLng !== null && vendorObj.location?.coordinates) {
        vendorObj.distanceKm = calculateDistanceKm(
          [userLng, userLat],
          vendorObj.location.coordinates
        );
        vendorObj.estimatedDeliveryFee = calculateDeliveryFee(vendorObj.distanceKm);
        vendorObj.estimatedMinutes = estimateTotalDeliveryTimeMinutes(
          vendorObj.prepTimeMinutes || 20,
          vendorObj.distanceKm
        );
      }
      return vendorObj;
    });

    return res.status(200).json({ count: results.length, vendors: results });
  } catch (error) {
    return handleControllerError(res, error, 'GetNearbyVendors');
  }
};

/**
 * GET VENDOR STORE DETAILS AND FULL MENU
 */
const getVendorDetailsAndMenu = async (req, res) => {
  try {
    const { id } = req.params; // VendorProfile ID

    const vendor = await VendorProfile.findById(id)
      .populate('address')
      .select('-dedicatedRiders');

    if (!vendor) {
      return res.status(404).json({ message: 'Store not found.' });
    }

    const [categories, menuItems] = await Promise.all([
      Category.find({ vendor: vendor._id, isActive: true }).sort({ displayOrder: 1 }),
      MenuItem.find({ vendor: vendor._id, isAvailable: true }),
    ]);

    // Group menu items by category
    const menuByCategory = categories.map((cat) => ({
      _id: cat._id,
      name: cat.name,
      displayOrder: cat.displayOrder,
      items: menuItems.filter((item) => item.category.toString() === cat._id.toString()),
    }));

    return res.status(200).json({
      vendor,
      categories: menuByCategory,
    });
  } catch (error) {
    return handleControllerError(res, error, 'GetVendorDetailsAndMenu');
  }
};

/**
 * CHECKOUT PREVIEW (CALCULATE COSTS & VERIFY ITEMS)
 */
const calculateCheckoutPreview = async (req, res) => {
  try {
    const { vendorId, items, orderType = 'DELIVERY', deliveryAddressId, deliveryCoordinates } = req.body;

    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'vendorId and items array are required.' });
    }

    const vendor = await VendorProfile.findById(vendorId).populate('address');
    if (!vendor) return res.status(404).json({ message: 'Store not found.' });

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findOne({ _id: item.menuItemId, vendor: vendorId });
      if (!menuItem) {
        return res.status(400).json({ message: `Menu item ${item.menuItemId} not found for this vendor.` });
      }

      let itemPrice = menuItem.price;
      const selectedOptions = [];

      if (item.selectedOptions && Array.isArray(item.selectedOptions)) {
        for (const opt of item.selectedOptions) {
          selectedOptions.push({ name: opt.name, price: Number(opt.price || 0) });
          itemPrice += Number(opt.price || 0);
        }
      }

      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: item.quantity,
        selectedOptions,
        total: itemTotal,
      });
    }

    // Distance calculation
    let distanceKm = 0;
    let customerCoords = null;

    if (orderType === 'DELIVERY') {
      if (deliveryCoordinates && Array.isArray(deliveryCoordinates)) {
        customerCoords = deliveryCoordinates;
      } else if (deliveryAddressId) {
        const addr = await Address.findById(deliveryAddressId).populate('location');
        if (addr?.location?.coordinates) {
          customerCoords = addr.location.coordinates;
        }
      }

      if (customerCoords && vendor.location?.coordinates) {
        distanceKm = calculateDistanceKm(vendor.location.coordinates, customerCoords);
      }
    }

    const deliveryFee = orderType === 'PICKUP' ? 0 : calculateDeliveryFee(distanceKm);
    const taxRate = 0.05; // 5% tax
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100;
    const estimatedMinutes = estimateTotalDeliveryTimeMinutes(vendor.prepTimeMinutes || 20, distanceKm);

    return res.status(200).json({
      orderType,
      vendor: {
        id: vendor._id,
        storeName: vendor.storeName,
        minOrderAmount: vendor.minOrderAmount,
      },
      items: validatedItems,
      pricing: {
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryFee,
        tax,
        total,
      },
      distanceKm,
      estimatedMinutes,
    });
  } catch (error) {
    return handleControllerError(res, error, 'CalculateCheckoutPreview');
  }
};

/**
 * PLACE ORDER (DELIVERY OR SELF-PICKUP)
 */
const placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const customer = await getCustomerProfileForUser(req.user._id);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Customer profile not found.' });
    }

    const {
      vendorId,
      items,
      orderType = 'DELIVERY',
      deliveryAddressId,
      deliveryAddressCustom,
      paymentMethod = 'CASH_ON_DELIVERY',
      specialInstructions,
    } = req.body;

    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'vendorId and items array are required.' });
    }

    const vendor = await VendorProfile.findById(vendorId).populate('address').session(session);
    if (!vendor) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Store not found.' });
    }

    if (!vendor.isAcceptingOrders) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'This store is currently not accepting orders.' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findOne({ _id: item.menuItemId, vendor: vendorId }).session(session);
      if (!menuItem || !menuItem.isAvailable) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `Menu item not available: ${item.menuItemId}` });
      }

      let itemPrice = menuItem.price;
      const selectedOptions = [];

      if (item.selectedOptions && Array.isArray(item.selectedOptions)) {
        for (const opt of item.selectedOptions) {
          selectedOptions.push({ name: opt.name, price: Number(opt.price || 0) });
          itemPrice += Number(opt.price || 0);
        }
      }

      subtotal += itemPrice * item.quantity;

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: item.quantity,
        selectedOptions,
      });
    }

    if (vendor.minOrderAmount && subtotal < vendor.minOrderAmount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Minimum order amount for ${vendor.storeName} is $${vendor.minOrderAmount}. Current subtotal is $${subtotal}.`,
      });
    }

    // Pickup address from vendor
    const pickupAddress = {
      addressLine: vendor.address?.addressLine || 'Store address',
      city: vendor.address?.city || 'City',
      location: {
        type: 'Point',
        coordinates: vendor.location?.coordinates || [0, 0],
      },
    };

    let deliveryAddress = null;
    let distanceKm = 0;

    if (orderType === 'DELIVERY') {
      if (deliveryAddressId) {
        const addr = await Address.findById(deliveryAddressId).populate('location').session(session);
        if (!addr) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Selected delivery address not found.' });
        }
        deliveryAddress = {
          addressLine: addr.addressLine,
          city: addr.city,
          location: {
            type: 'Point',
            coordinates: addr.location?.coordinates || [0, 0],
          },
        };
      } else if (deliveryAddressCustom) {
        deliveryAddress = deliveryAddressCustom;
      } else {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Delivery address is required for DELIVERY orders.' });
      }

      if (deliveryAddress?.location?.coordinates && vendor.location?.coordinates) {
        distanceKm = calculateDistanceKm(vendor.location.coordinates, deliveryAddress.location.coordinates);
      }
    }

    const deliveryFee = orderType === 'PICKUP' ? 0 : calculateDeliveryFee(distanceKm);
    const taxRate = 0.05;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100;
    const estimatedMinutes = estimateTotalDeliveryTimeMinutes(vendor.prepTimeMinutes || 20, distanceKm);
    const estimatedDeliveryTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    const newOrder = new Order({
      customer: customer._id,
      vendor: vendor._id,
      orderType,
      items: orderItems,
      pricing: {
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryFee,
        tax,
        total,
      },
      status: 'PENDING',
      distanceKm,
      prepTimeMinutes: vendor.prepTimeMinutes || 20,
      estimatedDeliveryTime,
      specialInstructions,
      payment: {
        method: paymentMethod,
        status: paymentMethod === 'CASH_ON_DELIVERY' ? 'PENDING' : 'COMPLETED',
      },
      pickupAddress,
      deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : undefined,
    });

    await newOrder.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Real-time notification to Vendor App!
    notifyVendorNewOrder(vendor._id, {
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
      orderType: newOrder.orderType,
      items: newOrder.items,
      pricing: newOrder.pricing,
      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
      createdAt: newOrder.createdAt,
    });

    return res.status(201).json({
      message: 'Order placed successfully! Waiting for store confirmation.',
      order: newOrder,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return handleControllerError(res, error, 'PlaceOrder');
  }
};

/**
 * GET CUSTOMER ORDERS
 */
const getCustomerOrders = async (req, res) => {
  try {
    const customer = await getCustomerProfileForUser(req.user._id);
    if (!customer) return res.status(404).json({ message: 'Customer profile not found.' });

    const orders = await Order.find({ customer: customer._id })
      .populate('vendor', 'storeName phone logoUrl location')
      .populate('rider', 'firstName lastName phone vehicle isOnline')
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: orders.length, orders });
  } catch (error) {
    return handleControllerError(res, error, 'GetCustomerOrders');
  }
};

/**
 * GET ORDER DETAILS
 */
const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await getCustomerProfileForUser(req.user._id);

    const order = await Order.findOne({ _id: id, customer: customer._id })
      .populate('vendor', 'storeName phone logoUrl address location')
      .populate('rider', 'firstName lastName phone vehicle location heading speed');

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    return res.status(200).json({ order });
  } catch (error) {
    return handleControllerError(res, error, 'GetOrderDetails');
  }
};

/**
 * LIVE IN-APP MAP TRACKING ENDPOINT
 * Formatted payload specifically for customer/vendor map screens
 */
const trackOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate('vendor', 'storeName phone address location')
      .populate('rider', 'firstName lastName phone vehicle location heading speed lastLocationUpdate')
      .populate('customer', 'firstName lastName phone');

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const trackingPayload = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      statusHistory: order.statusHistory,
      estimatedDeliveryTime: order.estimatedDeliveryTime,
      distanceKm: order.distanceKm,

      // Security PINs shown to relevant parties
      deliveryOtp: order.orderType === 'DELIVERY' ? order.deliveryOtp : undefined,
      pickupOtp: order.orderType === 'PICKUP' ? order.pickupOtp : undefined,

      vendor: {
        id: order.vendor?._id,
        storeName: order.vendor?.storeName,
        phone: order.vendor?.phone,
        address: order.pickupAddress?.addressLine,
        coordinates: order.pickupAddress?.location?.coordinates || order.vendor?.location?.coordinates,
      },

      customerDestination: order.orderType === 'DELIVERY' ? {
        address: order.deliveryAddress?.addressLine,
        city: order.deliveryAddress?.city,
        coordinates: order.deliveryAddress?.location?.coordinates,
      } : null,

      rider: order.rider ? {
        id: order.rider._id,
        name: `${order.rider.firstName} ${order.rider.lastName}`,
        phone: order.rider.phone,
        vehicle: order.rider.vehicle,
        coordinates: order.rider.location?.coordinates,
        heading: order.rider.heading || 0,
        speed: order.rider.speed || 0,
        lastUpdated: order.rider.lastLocationUpdate,
      } : null,
    };

    return res.status(200).json({ tracking: trackingPayload });
  } catch (error) {
    return handleControllerError(res, error, 'TrackOrder');
  }
};

/**
 * CANCEL ORDER (BY CUSTOMER)
 */
const cancelCustomerOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const customer = await getCustomerProfileForUser(req.user._id);
    if (!customer) return res.status(404).json({ message: 'Customer profile not found.' });

    const order = await Order.findOne({ _id: id, customer: customer._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.status !== 'PENDING') {
      return res.status(400).json({
        message: `Order cannot be cancelled in state ${order.status}. The store has already started processing it.`,
      });
    }

    order.status = 'CANCELLED';
    order.cancellation = {
      cancelledBy: 'customer',
      reason: reason || 'Customer decided to cancel.',
      cancelledAt: new Date(),
    };
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Order cancelled successfully.', order });
  } catch (error) {
    return handleControllerError(res, error, 'CancelCustomerOrder');
  }
};

module.exports = {
  getNearbyVendors,
  getVendorDetailsAndMenu,
  calculateCheckoutPreview,
  placeOrder,
  getCustomerOrders,
  getOrderDetails,
  trackOrder,
  cancelCustomerOrder,
};
