const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const addressRoutes = require('./routes/addressRoutes');
const locationRoutes = require('./routes/locationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const riderRoutes = require('./routes/riderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Global Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());

// Base Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/vendor', vendorRoutes);
app.use('/api/v1/rider', riderRoutes);
app.use('/api/v1/customer', customerRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/chat', chatRoutes);


// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'An unexpected server error occurred.',
    error: process.env.NODE_ENV === 'production' ? {} : err.stack,
  });
});

module.exports = app;