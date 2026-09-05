require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./utils/socket');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io with the HTTP server
initSocket(server);

// Connect to Database and start server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});