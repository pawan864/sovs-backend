const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// ── sign JWT ──────────────────────────────────────────────────────
const signToken = (userId, role = 'voter') =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30m',
  });

// ── audit ─────────────────────────────────────────────────────────
const audit = async (action, user, details, type = 'info', req = null) => {
  try {
    await AuditLog.create({
      action,
      userId:    user?._id  || null,
      userName:  user?.name || 'System',
      userRole:  user?.role || null,
      details,
      ipAddress: req?.ip    || null,
      type,
    });
  } catch (_) {}
};

// ── find voter by aadhaar OR eci ─────────────────────────────────
const findVoterByNumber = async (method, number) => {
  if (method === 'aadhaar') {
    return await User.findOne({ aadhaarNumber: number, role: 'voter' });
  } else {
    return await User.findOne({ eciCardNumber: number, role: 'voter' });
  }
};

// ── generate unique voterId ───────────────────────────────────────
const generateVoterId = async () => {
  const year = new Date().getFullYear();
  for (let i = 0; i < 50; i++) {
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const id   = `VTR-${rand}-${year}`;
    const exists = await User.findOne({ voterId: id });
    if (!exists) return id;
  }
  return `VTR-${Date.now()}-${year}`;
};

// ── generate unique email ────────────────────────────────────────
const generateEmail = async (method, number) => {
  const clean = number.replace(/[^a-zA-Z0-9]/g, '');
  const base  = `${method}.${clean}@voter.securevote.local`;
  const exists = await User.findOne({ email: base });
  if (!exists) return base;
  return `${method}.${clean}.${Date.now()}@voter.securevote.local`;
};

// ── build user response ──────────────────────────────────────────
const buildUserResponse = (voter) => {
  return voter.toJSON();
};

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login  (admin / dm / sdm / cdo)
// ─────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user)
      return res.status(401).json({ success: false, message: 'Invalid email or password' });

    if (user.role === 'voter')
      return res.status(400).json({ success: false, message: 'Voters must use OTP login.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await audit('LOGIN_FAILED', user, `Failed login for ${email}`, 'warning', req);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = signToken(user._id, user.role);
    await audit('LOGIN', user, `${user.role.toUpperCase()} logged in`, 'success', req);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/voter/send-otp
// Step 1: voter enters aadhaar/eci → check DB → send OTP
// ─────────────────────────────────────────────────────────────────
router.post('/voter/send-otp', async (req, res) => {
  try {
    const { method, number } = req.body;
    if (!method || !number)
      return res.status(400).json({ success: false, message: 'Method and number are required' });

    const voter = await findVoterByNumber(method, number);
    const otp   = process.env.OTP_SECRET || '123456';

    if (voter) {
      voter.otp = { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
      await voter.save();
      console.log(`[OTP] Existing voter ${voter.voterId}: ${otp}`);
      return res.json({
        success:   true,
        message:   'OTP sent successfully',
        voterId:   voter.voterId,
        voterName: voter.name,
        isNew:     false,
      });
    } else {
      console.log(`[OTP] New voter ${method}: ${number} — will register on verify`);
      return res.json({
        success:   true,
        message:   'OTP sent successfully',
        voterId:   null,
        voterName: null,
        isNew:     true,
      });
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/voter/check
// Step 1.5: check if voter exists and whether they have a password
// Returns: { isNew, hasPassword, voterId, voterName }
// ─────────────────────────────────────────────────────────────────
router.post('/voter/check', async (req, res) => {
  try {
    const { method, number } = req.body;
    if (!method || !number)
      return res.status(400).json({ success: false, message: 'Method and number required' });

    const voter = await findVoterByNumber(method, number);

    if (!voter) {
      // New voter — no account yet
      return res.json({ success: true, isNew: true, hasPassword: false });
    }

    if (voter.isBlocked) {
      return res.status(403).json({
        success: false,
        blocked: true,
        message: `Your account has been blocked.\nReason: ${voter.blockedReason || 'Violation of terms.'}\nContact support to appeal.`,
      });
    }

    const hasPassword = !!(voter.password && voter.password.length > 0);
    return res.json({
      success:     true,
      isNew:       false,
      hasPassword,
      voterId:     voter.voterId,
      voterName:   voter.name,
    });
  } catch (err) {
    console.error('Voter check error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/voter/verify-otp
// Step 2: verify OTP
//   - Existing voter with password → return needPassword: true
//   - Existing voter no password   → login directly
//   - New voter                    → register, return isNew: true
// Optional body field: password (used when re-calling after password entry)
// ─────────────────────────────────────────────────────────────────
router.post('/voter/verify-otp', async (req, res) => {
  try {
    const { voterId, otp, method, number, password } = req.body;

    if (!otp)
      return res.status(400).json({ success: false, message: 'OTP is required' });
    if (!method || !number)
      return res.status(400).json({ success: false, message: 'Method and number are required' });

    const demoOtp = process.env.OTP_SECRET || '123456';

    // ── Find voter ────────────────────────────────────────────────
    let voter = null;
    if (voterId) {
      voter = await User.findOne({ voterId, role: 'voter' });
    }
    if (!voter) {
      voter = await findVoterByNumber(method, number);
    }

    // ── Existing voter ────────────────────────────────────────────
    if (voter) {
      if (voter.isBlocked) {
        return res.status(403).json({
          success: false,
          blocked: true,
          message: `Your account has been blocked.\nReason: ${voter.blockedReason || 'Violation of terms.'}\nContact support to appeal.`,
        });
      }

      const otpValid =
        otp === demoOtp ||
        (voter.otp?.code === otp && voter.otp?.expiresAt > new Date());

      if (!otpValid)
        return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });

      // ── Check if voter has a password set ────────────────────────
      const hasPassword = !!(voter.password && voter.password.length > 0);

      if (hasPassword && !password) {
        // OTP valid but password required — tell frontend to show password field
        return res.json({
          success:      false,
          needPassword: true,
          isNew:        false,
          hasPassword:  true,
          voterId:      voter.voterId,
          voterName:    voter.name,
          message:      'Password required',
        });
      }

      if (hasPassword && password) {
        // Verify the provided password
        const pwMatch = await voter.comparePassword(password);
        if (!pwMatch) {
          return res.status(401).json({
            success: false,
            message: 'Incorrect password. Please try again.',
          });
        }
      }

      // ── All checks passed — log in ────────────────────────────────
      voter.otp = { code: null, expiresAt: null };
      await voter.save();

      const token = signToken(voter._id);
      await audit('VOTER_LOGIN', voter, `${voter.name} logged in`, 'success', req);

      return res.json({
        success: true,
        token,
        user:    buildUserResponse(voter),
        isNew:   false,
      });
    }

    // ── New voter → validate OTP ──────────────────────────────────
    if (otp !== demoOtp)
      return res.status(401).json({ success: false, message: 'Invalid OTP' });

    // Double-check uniqueness
    const alreadyExists = await findVoterByNumber(method, number);
    if (alreadyExists) {
      const token = signToken(alreadyExists._id);
      return res.json({
        success: true,
        token,
        user:    buildUserResponse(alreadyExists),
        isNew:   false,
      });
    }

    // ── Register new voter ────────────────────────────────────────
    const newVoterId = await generateVoterId();
    const newEmail   = await generateEmail(method, number);

    const newVoter = await User.create({
      voterId:       newVoterId,
      name:          `Voter ${newVoterId}`,
      email:         newEmail,
      password:      '',           // password set separately via /set-password
      role:          'voter',
      aadhaarNumber: method === 'aadhaar' ? number : null,
      eciCardNumber: method === 'eci'     ? number : null,
    });

    console.log(`[REGISTERED] ✅ ${newVoter.voterId} | ${method}: ${number}`);
    await audit('VOTER_REGISTERED', newVoter, `New voter registered via ${method}: ${number}`, 'success', req);

    const token = signToken(newVoter._id, 'voter');
    await audit('VOTER_LOGIN', newVoter, `${newVoter.name} first login`, 'success', req);

    return res.json({
      success: true,
      token,
      user:    buildUserResponse(newVoter),
      isNew:   true,
    });

  } catch (err) {
    console.error('Verify OTP error:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This Aadhaar/ECI number is already registered.',
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/voter/set-password
// New voter — set password for the first time (called after account creation)
// ─────────────────────────────────────────────────────────────────
router.post('/voter/set-password', protect, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'voter')
      return res.status(403).json({ success: false, message: 'Only voters can use this endpoint' });

    user.password = password; // pre-save hook hashes it
    await user.save();

    await audit('PASSWORD_SET', user, `${user.name} set their voter password`, 'success', req);

    res.json({ success: true, message: 'Password set successfully' });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────
router.post('/logout', protect, async (req, res) => {
  await audit('LOGOUT', req.user, `${req.user.role.toUpperCase()} logged out`, 'info', req);
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;