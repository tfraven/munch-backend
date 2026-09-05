const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

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
app.use(mongoSanitize());

// Trust reverse proxy (needed for correct req.ip behind nginx/load balancers,
// which rate limiting relies on). Remove if not running behind a proxy.
app.set('trust proxy', 1);

// ---- Global Security Middlewares ----

app.use(helmet());

// CORS allowlist — set ALLOWED_ORIGINS in your env as a comma-separated list,
// e.g. "https://yourapp.com,https://admin.yourapp.com"
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server, mobile apps) with no Origin header
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Body size limits to reduce DoS risk from oversized payloads
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// General rate limiter for all API routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/v1', generalLimiter);

// Stricter limiter for auth-related routes (login, OTP, password reset, etc.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

// ---- Base Health Check ----
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// ---- API Routes ----
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

// ---- 404 Route Handler ----
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// ---- Global Error Handler ----
const isProd = process.env.NODE_ENV === 'production';
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.statusCode || 500).json({
    message: isProd && !err.statusCode ? 'An unexpected server error occurred.' : (err.message || 'An unexpected server error occurred.'),
    ...(isProd ? {} : { error: err.stack }),
  });
});

module.exports = app;