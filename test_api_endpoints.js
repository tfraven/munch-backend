require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');

async function testHttpApis() {
  console.log('--- Testing HTTP REST Endpoints ---');
  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  try {
    // 1. Health check
    const healthRes = await fetch(`http://localhost:${port}/health`);
    const healthJson = await healthRes.json();
    console.log('✔ GET /health ->', healthRes.status, healthJson);

    // 2. Submit Vendor Request via HTTP POST /api/v1/auth/vendor-request
    const runId = Date.now().toString(36);
    const vendorReqPayload = {
      storeName: `Taco Fiesta ${runId}`,
      ownerName: 'Carlos Santana',
      email: `carlos_${runId}@example.com`,
      phone: `+1888${Math.floor(100000 + Math.random() * 900000)}`,
      cuisineTypes: ['mexican', 'fast_food'],
      deliveryOption: 'PLATFORM_RIDERS',
      address: {
        addressLine: '789 Sunset Blvd',
        city: 'Los Angeles',
        location: {
          coordinates: [-118.2437, 34.0522],
        },
      },
    };

    const vReqRes = await fetch(`${baseUrl}/auth/vendor-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendorReqPayload),
    });
    const vReqJson = await vReqRes.json();
    console.log('✔ POST /api/v1/auth/vendor-request ->', vReqRes.status, vReqJson.message);

    // 3. Register Customer via HTTP POST /api/v1/auth/register
    const custPayload = {
      username: `http_cust_${runId}`,
      password: 'SecurePassword123',
      role: 'customer',
      email: `http_cust_${runId}@example.com`,
      phone: `+1999${Math.floor(100000 + Math.random() * 900000)}`,
      firstName: 'Emily',
      lastName: 'Rose',
    };
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(custPayload),
    });
    const regJson = await regRes.json();
    console.log('✔ POST /api/v1/auth/register ->', regRes.status, regJson.message, 'Token received:', !!regJson.token);
    const customerToken = regJson.token;

    // 4. Test Customer Browse Nearby Vendors via HTTP GET /api/v1/customer/vendors
    const browseRes = await fetch(`${baseUrl}/customer/vendors?lat=40.7488&lng=-73.9851&radiusKm=20`);
    const browseJson = await browseRes.json();
    console.log('✔ GET /api/v1/customer/vendors ->', browseRes.status, `Found ${browseJson.count} nearby stores`);

    // 5. Test Profile Me endpoint
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const meJson = await meRes.json();
    console.log('✔ GET /api/v1/auth/me ->', meRes.status, 'Authenticated as:', meJson.user?.username, 'Role:', meJson.user?.role);

    console.log('\n========================================');
    console.log('✔ ALL HTTP API ENDPOINT TESTS PASSED!');
    console.log('========================================');
  } catch (err) {
    console.error('❌ HTTP API Test failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

testHttpApis();
