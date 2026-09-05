const mongoose = require('mongoose');

const VendorProfile = require('../models/VendorProfile');
const RiderProfile = require('../models/RiderProfile');
const User = require('../models/User');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

const { handleControllerError } = require('./utils/errorHandler');
const {
  emitOrderUpdate,
  notifyVendorDedicatedRiders,
  broadcastOrderToPlatformRiders,
  emitToUser,
} = require('../utils/socket');

// Helper to get vendor profile for current authenticated user
const getVendorProfileForUser = async (userId) => {
  return await VendorProfile.findOne({ user: userId });
};

// 4-digit OTP generator
const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

/**
 * GET MY VENDOR PROFILE
 */
const getMyVendorProfile = async (req, res) => {
  try {
    const vendor = await VendorProfile.findOne({ user: req.user._id })
      .populate('address')
      .populate('dedicatedRiders', 'firstName lastName email phone vehicle isOnline isAvailable isVerified');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found.' });
    }

    return res.status(200).json({ vendor });
  } catch (error) {
    return handleControllerError(res, error, 'GetMyVendorProfile');
  }
};

/**
 * UPDATE VENDOR PROFILE & SETTINGS
 */
const updateVendorProfile = async (req, res) => {
  try {
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found.' });
    }

    const allowedFields = [
      'storeName',
      'description',
      'phone',
      'cuisineTypes',
      'logoUrl',
      'bannerUrl',
      'isAcceptingOrders',
      'deliveryOption',
      'minOrderAmount',
      'prepTimeMinutes',
      'businessHours',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        vendor[field] = req.body[field];
      }
    });

    await vendor.save();

    return res.status(200).json({ message: 'Vendor profile updated successfully.', vendor });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateVendorProfile');
  }
};

// ==========================================
// DEDICATED RIDERS (VENDOR FLEET) MANAGEMENT
// ==========================================

/**
 * GET VENDOR'S DEDICATED RIDERS
 */
const getDedicatedRiders = async (req, res) => {
  try {
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const riders = await RiderProfile.find({
      _id: { $in: vendor.dedicatedRiders },
    }).populate('user', 'username isActive');

    return res.status(200).json({ count: riders.length, riders });
  } catch (error) {
    return handleControllerError(res, error, 'GetDedicatedRiders');
  }
};

/**
 * ADD A RIDER TO VENDOR'S DEDICATED FLEET
 * Rider must already be registered & verified on the Rider App
 */
const addDedicatedRider = async (req, res) => {
  try {
    const { identifier } = req.body; // Rider email, phone, or username
    if (!identifier) {
      return res.status(400).json({ message: 'Rider email, phone, or username is required.' });
    }

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    let rider = await RiderProfile.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
    });

    if (!rider) {
      const user = await User.findOne({ username: identifier.toLowerCase(), role: 'rider' });
      if (user) {
        rider = await RiderProfile.findOne({ user: user._id });
      }
    }

    if (!rider) {
      return res.status(404).json({ message: 'No registered rider found matching that identifier.' });
    }

    if (!rider.isVerified) {
      return res.status(400).json({
        message: 'This rider has not yet been verified by the platform admin. Only verified riders can be added to your fleet.',
      });
    }

    if (vendor.dedicatedRiders.some((id) => id.toString() === rider._id.toString())) {
      return res.status(409).json({ message: 'This rider is already part of your dedicated fleet.' });
    }

    // Link rider to vendor
    vendor.dedicatedRiders.push(rider._id);
    await vendor.save();

    rider.employerVendor = vendor._id;
    await rider.save();

    return res.status(200).json({
      message: `Rider ${rider.firstName} ${rider.lastName} successfully added to your store delivery fleet.`,
      rider,
    });
  } catch (error) {
    return handleControllerError(res, error, 'AddDedicatedRider');
  }
};

/**
 * REMOVE A RIDER FROM VENDOR'S DEDICATED FLEET
 */
const removeDedicatedRider = async (req, res) => {
  try {
    const { riderId } = req.params;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    vendor.dedicatedRiders = vendor.dedicatedRiders.filter(
      (id) => id.toString() !== riderId.toString()
    );
    await vendor.save();

    await RiderProfile.findByIdAndUpdate(riderId, { $set: { employerVendor: null } });

    return res.status(200).json({ message: 'Rider removed from dedicated fleet.' });
  } catch (error) {
    return handleControllerError(res, error, 'RemoveDedicatedRider');
  }
};

// ==========================================
// MENU CATEGORIES MANAGEMENT
// ==========================================

const getCategories = async (req, res) => {
  try {
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const categories = await Category.find({ vendor: vendor._id }).sort({ displayOrder: 1, name: 1 });
    return res.status(200).json({ categories });
  } catch (error) {
    return handleControllerError(res, error, 'GetCategories');
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, displayOrder } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required.' });

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const existing = await Category.findOne({ vendor: vendor._id, name: name.trim() });
    if (existing) return res.status(409).json({ message: 'Category name already exists.' });

    const category = new Category({
      vendor: vendor._id,
      name: name.trim(),
      displayOrder: displayOrder || 0,
    });
    await category.save();

    return res.status(201).json({ message: 'Category created.', category });
  } catch (error) {
    return handleControllerError(res, error, 'CreateCategory');
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, displayOrder, isActive } = req.body;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const category = await Category.findOne({ _id: id, vendor: vendor._id });
    if (!category) return res.status(404).json({ message: 'Category not found.' });

    if (name) category.name = name.trim();
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    return res.status(200).json({ message: 'Category updated.', category });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateCategory');
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const itemsCount = await MenuItem.countDocuments({ vendor: vendor._id, category: id });
    if (itemsCount > 0) {
      return res.status(400).json({
        message: `Cannot delete category with ${itemsCount} existing menu items. Reassign or delete those items first.`,
      });
    }

    await Category.findOneAndDelete({ _id: id, vendor: vendor._id });
    return res.status(200).json({ message: 'Category deleted.' });
  } catch (error) {
    return handleControllerError(res, error, 'DeleteCategory');
  }
};

// ==========================================
// MENU ITEMS MANAGEMENT
// ==========================================

const getMenuItems = async (req, res) => {
  try {
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const { categoryId } = req.query;
    const filter = { vendor: vendor._id };
    if (categoryId) filter.category = categoryId;

    const items = await MenuItem.find(filter).populate('category', 'name').sort({ createdAt: -1 });
    return res.status(200).json({ count: items.length, items });
  } catch (error) {
    return handleControllerError(res, error, 'GetMenuItems');
  }
};

const createMenuItem = async (req, res) => {
  try {
    const { name, description, price, category, imageUrl, options } = req.body;
    if (!name || price === undefined || !category) {
      return res.status(400).json({ message: 'Item name, price, and category are required.' });
    }

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const categoryExists = await Category.findOne({ _id: category, vendor: vendor._id });
    if (!categoryExists) {
      return res.status(400).json({ message: 'Specified category does not exist for your store.' });
    }

    const menuItem = new MenuItem({
      vendor: vendor._id,
      name: name.trim(),
      description,
      price: Number(price),
      category,
      imageUrl,
      options: options || [],
    });

    await menuItem.save();
    return res.status(201).json({ message: 'Menu item created.', menuItem });
  } catch (error) {
    return handleControllerError(res, error, 'CreateMenuItem');
  }
};

const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const menuItem = await MenuItem.findOne({ _id: id, vendor: vendor._id });
    if (!menuItem) return res.status(404).json({ message: 'Menu item not found.' });

    const fields = ['name', 'description', 'price', 'category', 'imageUrl', 'isAvailable', 'options'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) menuItem[f] = req.body[f];
    });

    await menuItem.save();
    return res.status(200).json({ message: 'Menu item updated.', menuItem });
  } catch (error) {
    return handleControllerError(res, error, 'UpdateMenuItem');
  }
};

const deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    await MenuItem.findOneAndDelete({ _id: id, vendor: vendor._id });
    return res.status(200).json({ message: 'Menu item deleted.' });
  } catch (error) {
    return handleControllerError(res, error, 'DeleteMenuItem');
  }
};

// ==========================================
// VENDOR ORDERS & DISPATCH WORKFLOW
// ==========================================

/**
 * GET VENDOR ORDERS
 */
const getStoreOrders = async (req, res) => {
  try {
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const { status, orderType } = req.query;
    const filter = { vendor: vendor._id };
    if (status) filter.status = status.toUpperCase();
    if (orderType) filter.orderType = orderType.toUpperCase();

    const orders = await Order.find(filter)
      .populate('customer', 'firstName lastName phone')
      .populate('rider', 'firstName lastName phone vehicle isOnline')
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: orders.length, orders });
  } catch (error) {
    return handleControllerError(res, error, 'GetStoreOrders');
  }
};

/**
 * ACCEPT ORDER
 */
const acceptOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { prepTimeMinutes } = req.body;

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const order = await Order.findOne({ _id: id, vendor: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot accept order with status ${order.status}.` });
    }

    order.status = 'ACCEPTED_BY_VENDOR';
    if (prepTimeMinutes) {
      order.prepTimeMinutes = Number(prepTimeMinutes);
    }
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Order accepted by store.', order });
  } catch (error) {
    return handleControllerError(res, error, 'AcceptOrder');
  }
};

/**
 * REJECT ORDER
 */
const rejectOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const order = await Order.findOne({ _id: id, vendor: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (['DELIVERED', 'CANCELLED', 'OUT_FOR_DELIVERY'].includes(order.status)) {
      return res.status(400).json({ message: `Order cannot be rejected in state ${order.status}.` });
    }

    order.status = 'CANCELLED';
    order.cancellation = {
      cancelledBy: 'vendor',
      reason: reason || 'Store unable to fulfill order at this time.',
      cancelledAt: new Date(),
    };
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Order rejected and cancelled.', order });
  } catch (error) {
    return handleControllerError(res, error, 'RejectOrder');
  }
};

/**
 * MARK ORDER PREPARING
 */
const markOrderPreparing = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const order = await Order.findOne({ _id: id, vendor: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.status !== 'ACCEPTED_BY_VENDOR') {
      return res.status(400).json({ message: 'Order must be ACCEPTED_BY_VENDOR before PREPARING.' });
    }

    order.status = 'PREPARING';
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Order is now being prepared.', order });
  } catch (error) {
    return handleControllerError(res, error, 'MarkOrderPreparing');
  }
};

/**
 * MARK ORDER READY FOR PICKUP & DISPATCH LOGIC
 * - If order is PICKUP: Customer gets pickupOtp to collect.
 * - If order is DELIVERY:
 *   - If vendor has OWN_RIDERS: only vendor's dedicated riders get notified.
 *   - If vendor has PLATFORM_RIDERS: broadcast to all nearby platform riders.
 */
const markOrderReady = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const order = await Order.findOne({ _id: id, vendor: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (!['ACCEPTED_BY_VENDOR', 'PREPARING'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot mark order ready from status ${order.status}.` });
    }

    order.status = 'READY_FOR_PICKUP';

    // 1. SELF-PICKUP FLOW
    if (order.orderType === 'PICKUP') {
      order.dispatchType = 'NONE';
      if (!order.pickupOtp) {
        order.pickupOtp = generateOtp();
      }
      await order.save();

      emitOrderUpdate(order._id, order);

      return res.status(200).json({
        message: 'Order is ready for customer pickup. Customer has been notified with their pickup PIN.',
        order,
      });
    }

    // 2. DELIVERY FLOW
    // Determine delivery dispatch mode based on vendor setup
    if (!order.deliveryOtp) {
      order.deliveryOtp = generateOtp();
    }

    const hasDedicatedRiders = Array.isArray(vendor.dedicatedRiders) && vendor.dedicatedRiders.length > 0;
    const usesDedicatedFleet = vendor.deliveryOption === 'OWN_RIDERS' || (vendor.deliveryOption === 'BOTH' && hasDedicatedRiders);

    if (usesDedicatedFleet) {
      order.dispatchType = 'VENDOR_FLEET';
      await order.save();

      // Emit notification strictly to this vendor's dedicated riders
      notifyVendorDedicatedRiders(vendor._id, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        storeName: vendor.storeName,
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
        pricing: order.pricing,
        distanceKm: order.distanceKm,
      });

      emitOrderUpdate(order._id, order);

      return res.status(200).json({
        message: 'Order is ready and dispatched to your dedicated store riders fleet.',
        dispatchType: 'VENDOR_FLEET',
        order,
      });
    } else {
      // Platform pool dispatch
      order.dispatchType = 'PLATFORM_BROADCAST';
      await order.save();

      // Broadcast to platform riders
      broadcastOrderToPlatformRiders({
        orderId: order._id,
        orderNumber: order.orderNumber,
        storeName: vendor.storeName,
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
        pricing: order.pricing,
        distanceKm: order.distanceKm,
      });

      emitOrderUpdate(order._id, order);

      return res.status(200).json({
        message: 'Order is ready and broadcasted to nearby platform riders.',
        dispatchType: 'PLATFORM_BROADCAST',
        order,
      });
    }
  } catch (error) {
    return handleControllerError(res, error, 'MarkOrderReady');
  }
};

/**
 * DIRECTLY ASSIGN ORDER TO A SPECIFIC DEDICATED RIDER (Vendor Fleet)
 */
const assignOrderToDedicatedRider = async (req, res) => {
  try {
    const { id } = req.params;
    const { riderId } = req.body;

    if (!riderId) return res.status(400).json({ message: 'riderId is required.' });

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const isDedicated = vendor.dedicatedRiders.some((rid) => rid.toString() === riderId.toString());
    if (!isDedicated) {
      return res.status(403).json({ message: 'This rider is not in your dedicated store fleet.' });
    }

    const rider = await RiderProfile.findById(riderId);
    if (!rider || !rider.isVerified) {
      return res.status(400).json({ message: 'Rider is not verified.' });
    }

    const order = await Order.findOne({ _id: id, vendor: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.orderType !== 'DELIVERY') {
      return res.status(400).json({ message: 'Cannot assign rider to a self-pickup order.' });
    }

    order.rider = rider._id;
    order.status = 'RIDER_ASSIGNED';
    order.dispatchType = 'VENDOR_FLEET';
    if (!order.deliveryOtp) {
      order.deliveryOtp = generateOtp();
    }
    await order.save();

    rider.currentOrder = order._id;
    await rider.save();

    emitToUser(rider.user, 'order:assigned', order);
    emitOrderUpdate(order._id, order);

    return res.status(200).json({
      message: `Order assigned directly to ${rider.firstName} ${rider.lastName}.`,
      order,
    });
  } catch (error) {
    return handleControllerError(res, error, 'AssignOrderToDedicatedRider');
  }
};

/**
 * CONFIRM CUSTOMER SELF-PICKUP (In-person handoff with OTP)
 */
const confirmCustomerPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { pickupOtp } = req.body;

    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const order = await Order.findOne({ _id: id, vendor: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.orderType !== 'PICKUP') {
      return res.status(400).json({ message: 'This is not a self-pickup order.' });
    }

    if (order.status !== 'READY_FOR_PICKUP') {
      return res.status(400).json({ message: `Order cannot be picked up in state ${order.status}.` });
    }

    if (order.pickupOtp && order.pickupOtp !== pickupOtp) {
      return res.status(400).json({ message: 'Invalid customer pickup PIN/OTP.' });
    }

    order.status = 'DELIVERED';
    if (order.payment.method === 'CASH_ON_DELIVERY') {
      order.payment.status = 'COMPLETED';
    }
    await order.save();

    emitOrderUpdate(order._id, order);

    return res.status(200).json({ message: 'Order successfully handed over to customer and completed.', order });
  } catch (error) {
    return handleControllerError(res, error, 'ConfirmCustomerPickup');
  }
};

/**
 * VENDOR STORE ANALYTICS
 */
const getVendorStats = async (req, res) => {
  try {
    const vendor = await getVendorProfileForUser(req.user._id);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    const [totalOrders, completedOrders, totalRevenueResult, popularItems] = await Promise.all([
      Order.countDocuments({ vendor: vendor._id }),
      Order.countDocuments({ vendor: vendor._id, status: 'DELIVERED' }),
      Order.aggregate([
        { $match: { vendor: vendor._id, status: 'DELIVERED' } },
        { $group: { _id: null, totalSales: { $sum: '$pricing.subtotal' } } },
      ]),
      Order.aggregate([
        { $match: { vendor: vendor._id, status: 'DELIVERED' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', count: { $sum: '$items.quantity' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const totalSales = totalRevenueResult[0]?.totalSales || 0;

    return res.status(200).json({
      stats: {
        totalOrders,
        completedOrders,
        totalSales: Math.round(totalSales * 100) / 100,
        popularItems,
      },
    });
  } catch (error) {
    return handleControllerError(res, error, 'GetVendorStats');
  }
};

module.exports = {
  getMyVendorProfile,
  updateVendorProfile,
  getDedicatedRiders,
  addDedicatedRider,
  removeDedicatedRider,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getStoreOrders,
  acceptOrder,
  rejectOrder,
  markOrderPreparing,
  markOrderReady,
  assignOrderToDedicatedRider,
  confirmCustomerPickup,
  getVendorStats,
};
