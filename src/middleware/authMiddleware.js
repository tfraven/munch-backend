const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.userId) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    // password is already excluded by schema (select: false); explicit
    // select left off here since it's redundant.
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token. User does not exist.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// Route-level RBAC: usage -> router.patch('/riders/:id/verify', protect, restrictTo('admin'), handler)
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
};

module.exports = { protect, restrictTo };