require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./utils/socket');

const PORT = process.env.PORT || 5000;

// ---- Fail fast if required env vars are missing ----
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET']; // adjust to your actual required vars
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const server = http.createServer(app);

// Basic slowloris / hanging-connection protection
server.headersTimeout = 65000; // slightly higher than keepAliveTimeout
server.keepAliveTimeout = 60000;
server.requestTimeout = 30000;

// Initialize Socket.io with the HTTP server
initSocket(server);

// ---- Process-level safety nets ----
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Log to your monitoring service here (Sentry, etc.) before exiting
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// ---- Graceful shutdown ----
const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    // If connectDB exposes a disconnect/close method, call it here, e.g.:
    // mongoose.connection.close(false, () => process.exit(0));
    process.exit(0);
  });

  // Force exit if shutdown hangs
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---- Connect to Database and start server ----
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });

module.exports = server;