const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false); // fail fast instead of buffering for 10s

let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // Already connected and healthy
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Stale/dropped connection — clear it so we actually reconnect
  // instead of resolving to a dead cached promise.
  if (cached.conn && mongoose.connection.readyState !== 1) {
    console.warn(`MongoDB connection unhealthy (readyState=${mongoose.connection.readyState}). Reconnecting...`);
    cached.conn = null;
    cached.promise = null;
  }

  // Connection attempt already in flight — reuse it instead of racing
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    }).then((conn) => {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    }).catch((err) => {
      cached.promise = null; // allow retry on next invocation
      throw err;
    });
  }

  cached.conn = await cached.promise;

  mongoose.connection.removeAllListeners('error');
  mongoose.connection.removeAllListeners('disconnected');
  mongoose.connection.removeAllListeners('reconnected');

  mongoose.connection.on('error', (err) => {
    console.error(`MongoDB connection error: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected.');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected.');
  });

  return cached.conn;
};

module.exports = connectDB;