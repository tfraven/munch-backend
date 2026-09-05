# Delivery Platform Backend - Complete API & Integration Guide

A complete, production-grade backend for an on-demand food & delivery platform (DoorDash / FoodPanda style) with **4 distinct roles**: **Admin**, **Vendor**, **Rider**, and **Customer**.

Features dual rider dispatching (dedicated store fleet vs. platform broadcast), self-pickup (takeaway), admin verification, and live in-app map tracking via REST & Socket.io.

---

## 1. Architecture & Fulfillment Overview

```
[CUSTOMER APP]                               [VENDOR APP]
  │                                            │
  │── Places Order (DELIVERY / PICKUP) ───────>│ Receives Real-time Alert
  │                                            │ Accepts & Prepares Order
  │                                            │
  │                                            ├── IF PICKUP:
  │<── Receives Pickup PIN (pickupOtp) ────────│   Customer collects at store
  │                                            │
  │                                            └── IF DELIVERY:
  │                                                ├── Mode A (OWN_RIDERS):
  │                                                │   Dispatches to Store Fleet
  │                                                └── Mode B (PLATFORM_RIDERS):
  │                                                    Broadcasts to Nearby Riders
                                                                │
                                                      [RIDER APP]
                                                        │
                                                        ├── Claims Broadcast / Assigned
                                                        ├── Arrived at Vendor Store
                                                        ├── Picks Up Order
                                                        ├── Streams Live GPS Coordinates
  [IN-APP MAP UI] <── Live Rider GPS ───────────────────┤
                                                        └── Delivers with OTP handoff
```

---

## 2. Real-Time Socket.io Integration (Live Map & Alerts)

Connect your mobile apps (Flutter, React Native, iOS, Android, Web) to the WebSocket server:

```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:5000");

// 1. Join room based on role
socket.emit("join_user", userId);
socket.emit("join_vendor", vendorProfileId);
socket.emit("join_rider", riderProfileId);

// 2. Rider joins dispatch rooms
socket.emit("join_platform_riders"); // If platform rider
socket.emit("join_vendor_fleet", vendorProfileId); // If dedicated store rider

// 3. In-App Map Live Tracking Room
socket.emit("join_order_track", orderId);

// Receive live rider coordinates on customer's map
socket.on("rider:location_ping", (data) => {
  // data = { riderId, coordinates: [lng, lat], heading, speed, updatedAt }
  updateRiderMarkerOnMap(data.coordinates, data.heading);
});

// Receive status updates (PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED)
socket.on("order:status_changed", (updatedOrder) => {
  refreshOrderUI(updatedOrder);
});
```

---

## 3. Complete REST API Reference

### Base URL: `http://localhost:5000/api/v1`

---

### A. Authentication & Onboarding (`/auth`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/auth/register` | Register Customer or Rider (riders require vehicle details) | Public |
| `POST` | `/auth/vendor-request` | Store submits onboarding registration request with location & docs | Public |
| `POST` | `/auth/login` | Universal login (Admin, Vendor, Rider, Customer) | Public |
| `GET` | `/auth/me` | Fetch authenticated profile & role info | Bearer Token |

---

### B. Admin Management (`/admin`) - Restricted to `admin`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/vendor-requests` | List all store onboarding applications (`?status=PENDING`) |
| `PATCH` | `/admin/vendor-requests/:id/review` | Approve/Reject vendor request (Auto-creates User & VendorProfile) |
| `POST` | `/admin/vendors` | Directly create a verified vendor store from admin panel |
| `GET` | `/admin/vendors` | List all vendors with status, address, and ratings |
| `GET` | `/admin/riders/pending-verification` | List riders waiting for document verification |
| `PATCH` | `/admin/riders/:id/verify` | Approve or Reject rider verification documents |
| `GET` | `/admin/riders` | List all riders with online and verification status |
| `PATCH` | `/admin/users/:userId/status` | Activate or deactivate/ban any user account (`{ isActive: false }`) |
| `GET` | `/admin/analytics` | Platform stats (orders breakdown, gross sales, delivery fees) |

---

### C. Vendor Operations (`/vendor`) - Restricted to `vendor`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/vendor/profile` | View store profile, address, business hours, delivery options |
| `PATCH` | `/vendor/profile` | Update store settings (`deliveryOption: 'OWN_RIDERS'` or `'PLATFORM_RIDERS'`) |
| `GET` | `/vendor/riders` | List vendor's dedicated store delivery riders |
| `POST` | `/vendor/riders/assign` | Add a verified rider to the store's private fleet (`{ identifier: email/phone }`) |
| `DELETE` | `/vendor/riders/:riderId` | Remove rider from store's private fleet |
| `GET` | `/vendor/categories` | Get store menu categories |
| `POST` | `/vendor/categories` | Create category (`{ name: 'Burgers', displayOrder: 1 }`) |
| `PUT` | `/vendor/categories/:id` | Update category |
| `DELETE` | `/vendor/categories/:id` | Delete category |
| `GET` | `/vendor/menu-items` | Get store menu items (`?categoryId=...`) |
| `POST` | `/vendor/menu-items` | Create menu item (with options, price, description, image) |
| `PUT` | `/vendor/menu-items/:id` | Update menu item or toggle availability |
| `DELETE` | `/vendor/menu-items/:id` | Delete menu item |
| `GET` | `/vendor/orders` | View store orders (`?status=PENDING&orderType=DELIVERY`) |
| `PATCH` | `/vendor/orders/:id/accept` | Accept order & set preparation time |
| `PATCH` | `/vendor/orders/:id/reject` | Reject order with reason |
| `PATCH` | `/vendor/orders/:id/preparing` | Mark order in preparation |
| `PATCH` | `/vendor/orders/:id/ready` | **Mark ready**: Generates pickup PIN (if pickup) or triggers delivery dispatch |
| `PATCH` | `/vendor/orders/:id/assign-rider`| Directly assign order to a specific dedicated store rider |
| `PATCH` | `/vendor/orders/:id/confirm-pickup` | Vendor confirms self-pickup using customer's PIN |
| `GET` | `/vendor/stats` | View store revenue, completed orders, and top items |

---

### D. Rider Operations (`/rider`) - Restricted to `rider`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/rider/profile` | View rider profile, vehicle, verification status, employer store |
| `POST` | `/rider/documents` | Upload verification documents (`CNIC_OR_ID`, `DRIVING_LICENSE`, etc.) |
| `PATCH` | `/rider/vehicle` | Update vehicle type, license plate, model, color |
| `PATCH` | `/rider/availability` | Toggle `isOnline` & `isAvailable` |
| `POST` | `/rider/location` | **Ping live GPS**: `{ coordinates: [lng, lat], heading, speed }` (emits to map) |
| `GET` | `/rider/orders/available` | Get available ready orders (store fleet orders or platform broadcast) |
| `POST` | `/rider/orders/:id/claim` | **Claim order**: Atomic first-come-first-served order assignment |
| `GET` | `/rider/orders/active` | Get active delivery in transit |
| `PATCH` | `/rider/orders/:id/arrive-vendor` | Rider arrived at store |
| `PATCH` | `/rider/orders/:id/pickup` | Rider collected food -> status `OUT_FOR_DELIVERY` |
| `PATCH` | `/rider/orders/:id/deliver` | Complete delivery to customer (verifies customer `deliveryOtp`) |
| `GET` | `/rider/earnings` | View delivery history and earnings breakdown |

---

### E. Customer Operations (`/customer`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/customer/vendors` | Discover nearby stores with distance, delivery fee, prep time (`?lat=..&lng=..&radiusKm=15`) | Public |
| `GET` | `/customer/vendors/:id` | View store details & full categorized menu | Public |
| `POST` | `/customer/orders/checkout-preview` | Pre-calculate subtotal, distance, delivery fee ($0 for pickup), tax, and ETA | Public |
| `POST` | `/customer/orders` | **Place order**: Choose `orderType: 'DELIVERY' \| 'PICKUP'`, items, address | Customer |
| `GET` | `/customer/orders` | View customer past and active orders | Customer |
| `GET` | `/customer/orders/:id` | Detailed order information | Customer |
| `GET` | `/customer/orders/:id/track` | **Live Map Tracking Payload**: Vendor, Rider, and Customer coordinates | Customer |
| `PATCH` | `/customer/orders/:id/cancel` | Cancel order if still `PENDING` | Customer |

---

### F. Universal In-App Map Tracking (`/orders/:id/track`)

Accessible by Customer, Rider, Vendor, or Admin. Returns formatted coordinates and pins for custom Mapbox / Google Maps / Leaflet UI:

```json
{
  "tracking": {
    "orderId": "60d0fe4f5311236168a109ca",
    "orderNumber": "ORD-MTMY32OJCAT",
    "orderType": "DELIVERY",
    "status": "OUT_FOR_DELIVERY",
    "deliveryOtp": "4321",
    "estimatedDeliveryTime": "2026-09-04T18:15:00.000Z",
    "distanceKm": 4.14,
    "vendor": {
      "id": "60d0fe4f5311236168a109cb",
      "storeName": "Burger Joint",
      "phone": "+1555123456",
      "address": "123 Main St",
      "coordinates": [-73.9851, 40.7488]
    },
    "customerDestination": {
      "address": "456 Park Ave",
      "city": "Metropolis",
      "coordinates": [-73.9654, 40.7829]
    },
    "rider": {
      "id": "60d0fe4f5311236168a109cc",
      "name": "Jack Swift",
      "phone": "+1666123456",
      "vehicle": {
        "type": "motorcycle",
        "licensePlate": "MOTO-NY123",
        "model": "Honda CB500"
      },
      "coordinates": [-73.9750, 40.7650],
      "heading": 45,
      "speed": 32,
      "lastUpdated": "2026-09-04T17:43:25.000Z"
    }
  }
}
---

### G. In-App Chat System (`/chat`) - Customer & Rider Direct Messaging

Restricted to the customer who placed the order and the rider assigned to deliver that order.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/chat/order/:orderId` | Send a new message on an active order | Customer / Rider |
| `GET` | `/chat/order/:orderId` | Fetch chat message history with pagination (`?page=1&limit=50`) | Customer / Rider / Admin |
| `PATCH` | `/chat/order/:orderId/read` | Mark all unread incoming messages as read | Customer / Rider |

#### Send Message Request (`POST /chat/order/:orderId`)
```json
{
  "message": "Hi rider! Please leave the food at the front door."
}
```

#### Message Response Sample
```json
{
  "message": "Message sent successfully.",
  "chatMessage": {
    "_id": "60d0fe4f5311236168a109ce",
    "order": "60d0fe4f5311236168a109ca",
    "sender": {
      "_id": "60d0fe4f5311236168a109c1",
      "username": "customer_alice",
      "email": "alice@example.com",
      "role": "customer"
    },
    "senderRole": "customer",
    "receiver": {
      "_id": "60d0fe4f5311236168a109c2",
      "username": "rider_bob",
      "email": "bob@example.com",
      "role": "rider"
    },
    "receiverRole": "rider",
    "message": "Hi rider! Please leave the food at the front door.",
    "isRead": false,
    "readAt": null,
    "createdAt": "2026-09-05T04:36:19.000Z"
  }
}
```

#### Real-Time Socket.io Chat Events
Clients join the order room with `socket.emit("join_order_track", orderId)` to participate in live chat:

```javascript
// Send / Receive Messages
socket.on("chat:receive_message", (messageData) => {
  displayMessageInChatUI(messageData);
});

// Typing Indicators
socket.emit("chat:typing", { orderId, userId, role, senderName });
socket.emit("chat:stop_typing", { orderId, userId, role });

socket.on("chat:user_typing", ({ orderId, userId, role, senderName, isTyping }) => {
  showTypingBubble(senderName, isTyping);
});

// Read Receipts
socket.on("chat:read_receipt", ({ orderId, readBy, readAt, count }) => {
  updateMessageTicksToRead();
});
```

---

## 4. How to Run the Server

```bash
# Start server in development mode
npm run dev

# Or in production
npm start
```
Server will start on port `5000` (or `PORT` defined in `.env`) and connect to MongoDB and Socket.io.

