const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const mongoose = require('mongoose');

// ── protect ───────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorised — no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Guest voter — id is not a valid ObjectId (e.g. "guest_123456789")
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      req.user = {
        _id:     decoded.id,
        id:      decoded.id,
        role:    decoded.role || 'voter',
        name:    'Guest Voter',
        voterId: decoded.id,
        isActive: true,
      };
      return next();
    }

    // Normal DB user lookup
    const user = await User.findById(decoded.id).select('-password -otp');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ── authorize ─────────────────────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorised to access this route`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };