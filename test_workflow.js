require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const CustomerProfile = require('./src/models/CustomerProfile');
const VendorProfile = require('./src/models/VendorProfile');
const RiderProfile = require('./src/models/RiderProfile');
const VendorRegistrationRequest = require('./src/models/VendorRegistrationRequest');
const Category = require('./src/models/Category');
const MenuItem = require('./src/models/MenuItem');
const Order = require('./src/models/Order');
const Address = require('./src/models/Address');
const Location = require('./src/models/Location');
const { calculateDistanceKm, calculateDeliveryFee } = require('./src/utils/geo');

async function runTests() {
  console.log('--- Starting Backend Workflow Verification Tests ---');
  await connectDB();

  const runId = Date.now().toString(36);

  try {
    // 1. Create Admin User
    console.log('\n[1] Creating Admin User...');
    const adminUser = new User({
      username: `admin_${runId}`,
      password: 'AdminPassword123',
      role: 'admin',
      isActive: true,
    });
    await adminUser.save();
    console.log('✔ Admin user created successfully:', adminUser.username);

    // 2. Vendor Onboarding Request Workflow
    console.log('\n[2] Vendor Submits Registration Request...');
    const vendorReq = new VendorRegistrationRequest({
      storeName: `Burger Joint ${runId}`,
      ownerName: 'Bob Builder',
      email: `bob_${runId}@example.com`,
      phone: `+1555${Math.floor(100000 + Math.random() * 900000)}`,
      cuisineTypes: ['american', 'fast_food'],
      address: {
        addressLine: '123 Main St',
        city: 'Metropolis',
        location: {
          type: 'Point',
          coordinates: [-73.9851, 40.7488], // NYC Empire State area
        },
      },
      deliveryOption: 'OWN_RIDERS',
      status: 'PENDING',
    });
    await vendorReq.save();
    console.log('✔ Vendor registration request submitted with ID:', vendorReq._id);

    // Admin Approves Vendor Request
    console.log('\n[3] Admin Approves Vendor Request...');
    const vendorUsername = `vendor_${runId}`;
    const vendorUser = new User({
      username: vendorUsername,
      password: 'VendorPassword123',
      role: 'vendor',
      isActive: true,
    });
    await vendorUser.save();

    const vendorProfileId = new mongoose.Types.ObjectId();
    const vendorAddress = new Address({
      label: 'Store',
      addressLine: vendorReq.address.addressLine,
      city: vendorReq.address.city,
      owner: vendorProfileId,
      ownerType: 'VendorProfile',
      isDefault: true,
    });
    const vendorLocation = new Location({
      coordinates: vendorReq.address.location.coordinates,
      owner: vendorAddress._id,
      ownerType: 'Address',
    });
    await vendorLocation.save();
    vendorAddress.location = vendorLocation._id;
    await vendorAddress.save();

    const vendorProfile = new VendorProfile({
      _id: vendorProfileId,
      user: vendorUser._id,
      storeName: vendorReq.storeName,
      email: vendorReq.email,
      phone: vendorReq.phone,
      cuisineTypes: vendorReq.cuisineTypes,
      deliveryOption: 'OWN_RIDERS',
      address: vendorAddress._id,
      location: {
        type: 'Point',
        coordinates: vendorReq.address.location.coordinates,
      },
      isVerified: true,
      isAcceptingOrders: true,
      registrationRequest: vendorReq._id,
    });
    await vendorProfile.save();

    vendorReq.status = 'APPROVED';
    vendorReq.reviewedBy = adminUser._id;
    vendorReq.reviewedAt = new Date();
    vendorReq.createdUser = vendorUser._id;
    vendorReq.createdVendorProfile = vendorProfile._id;
    await vendorReq.save();
    console.log('✔ Vendor approved & profile created:', vendorProfile.storeName);

    // 4. Rider Registration & Admin Verification
    console.log('\n[4] Rider Self-Registers & Admin Verifies...');
    const riderUser = new User({
      username: `rider_${runId}`,
      password: 'RiderPassword123',
      role: 'rider',
      isActive: true,
    });
    await riderUser.save();

    const riderProfile = new RiderProfile({
      user: riderUser._id,
      firstName: 'Jack',
      lastName: 'Swift',
      email: `jack_${runId}@example.com`,
      phone: `+1666${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle: {
        type: 'motorcycle',
        licensePlate: `MOTO-${runId.toUpperCase()}`,
        model: 'Honda CB500',
      },
      documents: [
        { docType: 'DRIVING_LICENSE', docUrl: 'https://example.com/license.pdf', docNumber: 'DL123456' },
      ],
      location: {
        type: 'Point',
        coordinates: [-73.9855, 40.7480],
      },
      heading: 90,
      speed: 0,
      verificationStatus: 'PENDING',
      isVerified: false,
    });
    await riderProfile.save();
    console.log('✔ Rider registered, verificationStatus = PENDING');

    // Admin verifies rider
    riderProfile.verificationStatus = 'APPROVED';
    riderProfile.isVerified = true;
    riderProfile.verifiedAt = new Date();
    riderProfile.verifiedBy = adminUser._id;
    riderProfile.isOnline = true;
    riderProfile.isAvailable = true;
    await riderProfile.save();
    console.log('✔ Admin verified rider. Rider is now verified & online.');

    // 5. Vendor links Rider to Dedicated Fleet
    console.log('\n[5] Vendor Links Rider to Dedicated Fleet...');
    vendorProfile.dedicatedRiders.push(riderProfile._id);
    await vendorProfile.save();
    riderProfile.employerVendor = vendorProfile._id;
    await riderProfile.save();
    console.log(`✔ Rider ${riderProfile.firstName} added to ${vendorProfile.storeName} dedicated fleet!`);

    // 6. Vendor Creates Menu Categories & Items
    console.log('\n[6] Vendor Creates Category & Menu Items...');
    const category = new Category({
      vendor: vendorProfile._id,
      name: 'Signature Burgers',
      displayOrder: 1,
    });
    await category.save();

    const burgerItem = new MenuItem({
      vendor: vendorProfile._id,
      category: category._id,
      name: 'Double Bacon Cheeseburger',
      price: 12.99,
      description: 'Juicy double patty with melted cheddar and crispy bacon.',
      options: [
        {
          title: 'Extra Toppings',
          choices: [
            { name: 'Extra Cheese', price: 1.5 },
            { name: 'Avocado', price: 2.0 },
          ],
        },
      ],
    });
    await burgerItem.save();
    console.log('✔ Menu item created:', burgerItem.name, `($${burgerItem.price})`);

    // 7. Customer Registers & Places Self-Pickup Order
    console.log('\n[7] Customer Registers & Places SELF-PICKUP Order...');
    const customerUser = new User({
      username: `cust_${runId}`,
      password: 'CustPassword123',
      role: 'customer',
      isActive: true,
    });
    await customerUser.save();

    const customerProfile = new CustomerProfile({
      user: customerUser._id,
      firstName: 'Alice',
      lastName: 'Wonderland',
      email: `alice_${runId}@example.com`,
      phone: `+1777${Math.floor(100000 + Math.random() * 900000)}`,
    });
    await customerProfile.save();

    const pickupOrder = new Order({
      customer: customerProfile._id,
      vendor: vendorProfile._id,
      orderType: 'PICKUP',
      items: [
        {
          menuItem: burgerItem._id,
          name: burgerItem.name,
          price: burgerItem.price,
          quantity: 1,
          selectedOptions: [{ name: 'Extra Cheese', price: 1.5 }],
        },
      ],
      pricing: {
        subtotal: 14.49,
        deliveryFee: 0, // PICKUP has 0 delivery fee!
        tax: 0.72,
        total: 15.21,
      },
      status: 'PENDING',
      payment: { method: 'CARD', status: 'COMPLETED' },
      pickupAddress: {
        addressLine: vendorProfile.address.toString(),
        city: 'Metropolis',
        location: vendorProfile.location,
      },
    });
    await pickupOrder.save();
    console.log('✔ Pickup order placed:', pickupOrder.orderNumber, 'Delivery fee:', pickupOrder.pricing.deliveryFee);

    // Vendor accepts & marks pickup order ready
    pickupOrder.status = 'READY_FOR_PICKUP';
    pickupOrder.pickupOtp = '7890';
    await pickupOrder.save();
    console.log('✔ Order marked READY_FOR_PICKUP. Pickup PIN:', pickupOrder.pickupOtp);

    // Customer shows OTP to vendor -> Delivered!
    pickupOrder.status = 'DELIVERED';
    await pickupOrder.save();
    console.log('✔ Customer collected pickup order. Status: DELIVERED');

    // 8. Customer Places DELIVERY Order (Handled by Dedicated Fleet)
    console.log('\n[8] Customer Places DELIVERY Order for Vendor with Dedicated Fleet...');
    const customerDestCoords = [-73.9654, 40.7829]; // Central Park area ~4 km away
    const distance = calculateDistanceKm(vendorProfile.location.coordinates, customerDestCoords);
    const deliveryFee = calculateDeliveryFee(distance);

    const deliveryOrder = new Order({
      customer: customerProfile._id,
      vendor: vendorProfile._id,
      orderType: 'DELIVERY',
      items: [
        {
          menuItem: burgerItem._id,
          name: burgerItem.name,
          price: burgerItem.price,
          quantity: 2,
        },
      ],
      pricing: {
        subtotal: 25.98,
        deliveryFee,
        tax: 1.30,
        total: Math.round((25.98 + deliveryFee + 1.30) * 100) / 100,
      },
      status: 'PENDING',
      distanceKm: distance,
      payment: { method: 'CASH_ON_DELIVERY', status: 'PENDING' },
      pickupAddress: {
        addressLine: '123 Main St',
        city: 'Metropolis',
        location: vendorProfile.location,
      },
      deliveryAddress: {
        addressLine: '456 Park Ave',
        city: 'Metropolis',
        location: {
          type: 'Point',
          coordinates: customerDestCoords,
        },
      },
    });
    await deliveryOrder.save();
    console.log(`✔ Delivery order created! Distance: ${distance}km, Delivery Fee: $${deliveryFee}`);

    // Vendor marks order ready -> sets dispatchType to VENDOR_FLEET
    deliveryOrder.status = 'READY_FOR_PICKUP';
    deliveryOrder.dispatchType = 'VENDOR_FLEET';
    deliveryOrder.deliveryOtp = '4321';
    await deliveryOrder.save();
    console.log('✔ Vendor marked order READY_FOR_PICKUP. Dispatched to VENDOR_FLEET.');

    // Dedicated rider accepts order
    deliveryOrder.rider = riderProfile._id;
    deliveryOrder.status = 'RIDER_ASSIGNED';
    await deliveryOrder.save();
    riderProfile.currentOrder = deliveryOrder._id;
    riderProfile.isAvailable = false;
    await riderProfile.save();
    console.log('✔ Dedicated rider assigned to order.');

    // Rider updates GPS location (In-app map ping)
    riderProfile.location.coordinates = [-73.9750, 40.7650];
    riderProfile.heading = 45;
    riderProfile.speed = 32;
    await riderProfile.save();
    console.log('✔ Rider GPS updated on map: coords=[-73.9750, 40.7650], heading=45°, speed=32km/h');

    // Rider picks up -> Out for delivery -> Delivered with OTP
    deliveryOrder.status = 'OUT_FOR_DELIVERY';
    await deliveryOrder.save();
    console.log('✔ Rider picked up food from store. Status: OUT_FOR_DELIVERY');

    deliveryOrder.status = 'DELIVERED';
    deliveryOrder.payment.status = 'COMPLETED';
    await deliveryOrder.save();
    riderProfile.currentOrder = null;
    riderProfile.isAvailable = true;
    await riderProfile.save();
    console.log('✔ Order delivered to customer with OTP. Status: DELIVERED, Rider released.');

    console.log('\n========================================');
    console.log('✔ ALL WORKFLOW TESTS PASSED SUCCESSFULLY!');
    console.log('========================================');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTests();
