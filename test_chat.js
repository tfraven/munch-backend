require('dotenv').config();
const http = require('http');
const { io: ClientIO } = require('socket.io-client');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initSocket } = require('./src/utils/socket');
const mongoose = require('mongoose');

const User = require('./src/models/User');
const CustomerProfile = require('./src/models/CustomerProfile');
const VendorProfile = require('./src/models/VendorProfile');
const RiderProfile = require('./src/models/RiderProfile');
const Order = require('./src/models/Order');
const MenuItem = require('./src/models/MenuItem');
const Category = require('./src/models/Category');
const Address = require('./src/models/Address');
const jwt = require('jsonwebtoken');


const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
};

async function runChatTests() {
  console.log('==================================================');
  console.log('🚀 STARTING CUSTOMER-RIDER CHAT SYSTEM INTEGRATION TESTS');
  console.log('==================================================\n');

  await connectDB();

  const server = http.createServer(app);
  initSocket(server);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;
  const socketUrl = `http://localhost:${port}`;

  const runId = Date.now().toString(36);

  try {
    // 1. Create Customer
    console.log('[1] Creating Customer...');
    const customerUser = await User.create({
      username: `chat_cust_${runId}`,
      password: 'Password123',
      role: 'customer',
      isActive: true,
    });
    const customerProfile = await CustomerProfile.create({
      user: customerUser._id,
      firstName: 'Alice',
      lastName: 'Wonderland',
      email: `alice_${runId}@example.com`,
      phone: `+1111${Math.floor(100000 + Math.random() * 900000)}`,
    });
    const customerToken = generateToken(customerUser._id);
    console.log('✔ Customer created:', customerUser.username);

    // 2. Create Rider
    console.log('\n[2] Creating Verified Rider...');
    const riderUser = await User.create({
      username: `chat_rider_${runId}`,
      password: 'Password123',
      role: 'rider',
      isActive: true,
    });
    const riderProfile = await RiderProfile.create({
      user: riderUser._id,
      firstName: 'Bob',
      lastName: 'Speedy',
      email: `bob_${runId}@example.com`,
      phone: `+2222${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle: {
        type: 'motorcycle',
        licensePlate: `PLATE-${runId.toUpperCase()}`,
      },
      verificationStatus: 'APPROVED',
      isVerified: true,
      isOnline: true,
      isAvailable: true,
    });
    const riderToken = generateToken(riderUser._id);
    console.log('✔ Rider created & verified:', riderUser.username);

    // 3. Create Vendor and Menu Item
    console.log('\n[3] Creating Vendor Store...');
    const vendorUser = await User.create({
      username: `chat_vendor_${runId}`,
      password: 'Password123',
      role: 'vendor',
      isActive: true,
    });
    const vendorProfileId = new mongoose.Types.ObjectId();
    const vendorAddress = await Address.create({
      label: 'Store',
      addressLine: '456 Gourmet Ave',
      city: 'FoodCity',
      owner: vendorProfileId,
      ownerType: 'VendorProfile',
      isDefault: true,
    });
    const vendorProfile = await VendorProfile.create({
      _id: vendorProfileId,
      user: vendorUser._id,
      storeName: `Chat Gourmet ${runId}`,
      email: `vendor_${runId}@example.com`,
      phone: `+3333${Math.floor(100000 + Math.random() * 900000)}`,
      cuisineTypes: ['pizza'],
      address: vendorAddress._id,
      location: {
        type: 'Point',
        coordinates: [-73.9851, 40.7488],
      },
      isVerified: true,
      isAcceptingOrders: true,
    });



    const category = await Category.create({
      vendor: vendorProfile._id,
      name: 'Pizzas',
    });

    const menuItem = await MenuItem.create({
      vendor: vendorProfile._id,
      category: category._id,
      name: 'Margherita Pizza',
      price: 15.99,
    });

    // 4. Create Order without Rider first (to test unassigned order error)
    console.log('\n[4] Creating Order (Unassigned Rider)...');
    const orderUnassigned = await Order.create({
      customer: customerProfile._id,
      vendor: vendorProfile._id,
      rider: null,
      orderType: 'DELIVERY',
      dispatchType: 'PLATFORM_BROADCAST',
      items: [
        {
          menuItem: menuItem._id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: 1,
        },
      ],
      pricing: {
        subtotal: 15.99,
        deliveryFee: 3.5,
        tax: 1.5,
        discount: 0,
        total: 20.99,
      },
      pickupAddress: {
        addressLine: '456 Gourmet Ave',
        city: 'FoodCity',
        location: {
          type: 'Point',
          coordinates: [-73.9851, 40.7488],
        },
      },
      deliveryAddress: {
        addressLine: '100 Customer Way',
        city: 'FoodCity',
        location: {
          type: 'Point',
          coordinates: [-73.9800, 40.7500],
        },
      },
      payment: {
        method: 'CARD',
        status: 'COMPLETED',
      },
      status: 'PENDING',
    });


    // 5. Test chatting when rider is not assigned yet -> Should return 400
    console.log('\n[5] Testing Chat on Unassigned Order (Expecting 400)...');
    const earlyMsgRes = await fetch(`${baseUrl}/chat/order/${orderUnassigned._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ message: 'Hello? Anyone there?' }),
    });
    const earlyMsgJson = await earlyMsgRes.json();
    console.log(`✔ POST /chat/order/:id status: ${earlyMsgRes.status}, message: "${earlyMsgJson.message}"`);
    if (earlyMsgRes.status !== 400) {
      throw new Error(`Expected 400 but got ${earlyMsgRes.status}`);
    }

    // 6. Assign Rider to Order
    console.log('\n[6] Assigning Rider to Order...');
    orderUnassigned.rider = riderProfile._id;
    orderUnassigned.status = 'OUT_FOR_DELIVERY';
    await orderUnassigned.save();
    const activeOrderId = orderUnassigned._id.toString();
    console.log('✔ Order assigned to rider:', riderProfile.firstName);

    // 7. Setup Socket.io clients for Customer & Rider
    console.log('\n[7] Connecting Socket.io clients...');
    const customerSocket = ClientIO(socketUrl);
    const riderSocket = ClientIO(socketUrl);

    await Promise.all([
      new Promise((resolve) => customerSocket.on('connect', resolve)),
      new Promise((resolve) => riderSocket.on('connect', resolve)),
    ]);

    // Both join the order tracking/chat room
    customerSocket.emit('join_order_track', activeOrderId);
    riderSocket.emit('join_order_track', activeOrderId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    console.log('✔ Customer and Rider connected and joined room: order_' + activeOrderId);

    // 8. Test Customer sending message via REST and Rider receiving via Socket
    console.log('\n[8] Testing Customer -> Rider Message via REST & Socket...');
    const riderReceivedMessagePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket timeout waiting for message')), 3000);
      riderSocket.on('chat:receive_message', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });

    const sendRes1 = await fetch(`${baseUrl}/chat/order/${activeOrderId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ message: 'Hi rider! Please leave the food by the blue door.' }),
    });
    const sendJson1 = await sendRes1.json();
    console.log('✔ Customer POST /chat/order/:id ->', sendRes1.status, sendJson1.message);
    if (sendRes1.status !== 201) throw new Error('Failed to send customer message');

    const riderReceivedMsg = await riderReceivedMessagePromise;
    console.log('✔ Rider received socket event chat:receive_message:');
    console.log(`   Sender: ${riderReceivedMsg.senderRole} | Message: "${riderReceivedMsg.message}"`);

    // 9. Test Rider Typing Indicator via Socket
    console.log('\n[9] Testing Rider Typing Event via Socket...');
    const customerReceivedTypingPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket timeout waiting for typing event')), 3000);
      customerSocket.on('chat:user_typing', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    riderSocket.emit('chat:typing', {
      orderId: activeOrderId,
      userId: riderUser._id.toString(),
      role: 'rider',
      senderName: 'Bob (Rider)',
    });

    const typingData = await customerReceivedTypingPromise;
    console.log('✔ Customer received chat:user_typing ->', typingData);

    // 10. Test Rider Replying to Customer
    console.log('\n[10] Testing Rider -> Customer Message...');
    const customerReceivedMessagePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket timeout waiting for reply message')), 3000);
      customerSocket.on('chat:receive_message', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });

    const sendRes2 = await fetch(`${baseUrl}/chat/order/${activeOrderId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`,
      },
      body: JSON.stringify({ message: 'Got it! I am 2 minutes away.' }),
    });
    const sendJson2 = await sendRes2.json();
    console.log('✔ Rider POST /chat/order/:id ->', sendRes2.status, sendJson2.message);
    if (sendRes2.status !== 201) throw new Error('Failed to send rider reply');

    const customerReceivedMsg = await customerReceivedMessagePromise;
    console.log('✔ Customer received socket event chat:receive_message:');
    console.log(`   Sender: ${customerReceivedMsg.senderRole} | Message: "${customerReceivedMsg.message}"`);

    // 11. Test Fetching Chat History (GET /api/v1/chat/order/:orderId)
    console.log('\n[11] Testing GET Chat History...');
    const historyRes = await fetch(`${baseUrl}/chat/order/${activeOrderId}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const historyJson = await historyRes.json();
    console.log(`✔ GET /chat/order/:id -> Total messages: ${historyJson.totalMessages}`);
    historyJson.messages.forEach((m, idx) => {
      console.log(`   [${idx + 1}] [${m.senderRole.toUpperCase()}]: ${m.message} (isRead: ${m.isRead})`);
    });
    if (historyJson.totalMessages !== 2) {
      throw new Error(`Expected 2 messages in history, got ${historyJson.totalMessages}`);
    }

    // 12. Test Marking Messages as Read (PATCH /api/v1/chat/order/:orderId/read)
    console.log('\n[12] Testing Mark as Read & Read Receipt...');
    const riderReceivedReadReceiptPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket timeout waiting for read receipt')), 3000);
      riderSocket.on('chat:read_receipt', (receipt) => {
        clearTimeout(timer);
        resolve(receipt);
      });
    });

    const markReadRes = await fetch(`${baseUrl}/chat/order/${activeOrderId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const markReadJson = await markReadRes.json();
    console.log('✔ Customer PATCH /chat/order/:id/read ->', markReadRes.status, markReadJson);

    const readReceipt = await riderReceivedReadReceiptPromise;
    console.log('✔ Rider received socket event chat:read_receipt ->', readReceipt);

    // 13. Test Unauthorized Access (Another user trying to view/send chat)
    console.log('\n[13] Testing Unauthorized Access Control (Stranger User)...');
    const strangerUser = await User.create({
      username: `stranger_${runId}`,
      password: 'Password123',
      role: 'customer',
      isActive: true,
    });
    const strangerToken = generateToken(strangerUser._id);

    const unauthorizedRes = await fetch(`${baseUrl}/chat/order/${activeOrderId}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    const unauthorizedJson = await unauthorizedRes.json();
    console.log(`✔ Unauthorized GET /chat/order/:id -> Status: ${unauthorizedRes.status}, Message: "${unauthorizedJson.message}"`);
    if (unauthorizedRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for stranger, got ${unauthorizedRes.status}`);
    }

    customerSocket.disconnect();
    riderSocket.disconnect();

    console.log('\n==================================================');
    console.log('🎉 ALL CHAT INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
    console.log('==================================================\n');
  } catch (error) {
    console.error('❌ Chat test failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
    process.exit(process.exitCode || 0);
  }
}

runChatTests();
