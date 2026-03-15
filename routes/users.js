const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// GET /api/users
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { role, district } = req.query;
    const filter = {};
    if (role)     filter.role = role;
    if (district) filter.district = district;
    const users = await User.find(filter).select('-password -otp').sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET /api/users/blocked/list — BEFORE GET /:id
router.get('/blocked/list', protect, authorize('admin'), async (req, res) => {
  try {
    const blocked = await User.find({ isBlocked: true, role: 'voter' })
      .select('-password -otp')
      .sort({ blockedAt: -1 });
    res.json({ success: true, count: blocked.length, data: blocked });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users/:id — generic, after specific
router.get('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: 'Access denied' });
    const user = await User.findById(req.params.id).select('-password -otp');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role, voterId, department, district, avatar, aadhaarNumber, eciCardNumber } = req.body;
    if (!name || !email || !role || !voterId)
      return res.status(400).json({ success: false, message: 'name, email, role and voterId are required' });
    const existing = await User.findOne({ $or: [{ email }, { voterId }] });
    if (existing)
      return res.status(400).json({ success: false, message: 'Email or voterId already registered' });
    const user = await User.create({
      name, email, password: password || '', role, voterId,
      department, district, avatar,
      aadhaarNumber: aadhaarNumber || null,
      eciCardNumber: eciCardNumber || null,
    });
    await AuditLog.create({
      action: 'CREATE_USER', userId: req.user._id, userName: req.user.name, userRole: req.user.role,
      details: `User created: ${email} (${role})`, type: 'success',
    });
    res.status(201).json({ success: true, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ PUT /api/users/:id/block — BEFORE PUT /:id
router.put('/:id/block', protect, authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim())
      return res.status(400).json({ success: false, message: 'Block reason is required' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin')
      return res.status(400).json({ success: false, message: 'Cannot block an admin' });

    user.isBlocked     = true;
    user.blockedReason = reason.trim();
    user.blockedAt     = new Date();
    user.blockedBy     = req.user.name;
    await user.save();

    await AuditLog.create({
      action: 'VOTER_BLOCKED', userId: req.user._id, userName: req.user.name, userRole: req.user.role,
      details: `Voter "${user.name}" (${user.voterId || user._id}) blocked. Reason: ${reason}`,
      type: 'warning',
    });

    res.json({ success: true, message: `${user.name} has been blocked`, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ PUT /api/users/:id/unblock — BEFORE PUT /:id
router.put('/:id/unblock', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isBlocked     = false;
    user.blockedReason = null;
    user.blockedAt     = null;
    user.blockedBy     = null;
    await user.save();

    await AuditLog.create({
      action: 'VOTER_UNBLOCKED', userId: req.user._id, userName: req.user.name, userRole: req.user.role,
      details: `Voter "${user.name}" (${user.voterId || user._id}) unblocked by ${req.user.name}`,
      type: 'success',
    });

    res.json({ success: true, message: `${user.name} has been unblocked`, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/users/:id/change-password  ← BEFORE PUT /:id (already is)
// Admin or self — change password
// ─────────────────────────────────────────────────────────────────
router.put('/:id/change-password', protect, async (req, res) => {
  try {
    // Only admin or the user themselves
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

    // Fetch with password field
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    // Set new password — pre-save hook will hash it
    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      action: 'PASSWORD_CHANGED', userId: req.user._id,
      userName: req.user.name, userRole: req.user.role,
      details: `Password changed for ${user.name} (${user.email})`,
      type: 'success',
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// PUT /api/users/:id/update-profile  ← BEFORE PUT /:id
// Admin or self — update name + avatar
// ─────────────────────────────────────────────────────────────────
router.put('/:id/update-profile', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { name, avatar } = req.body;
    if (name && name.trim())  user.name   = name.trim();
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    await AuditLog.create({
      action: 'PROFILE_UPDATED', userId: req.user._id,
      userName: req.user.name, userRole: req.user.role,
      details: `Profile updated for ${user.name} (${user.email})`,
      type: 'success',
    });

    res.json({ success: true, message: 'Profile updated successfully', data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// PUT /api/users/:id/update-location  ← BEFORE PUT /:id
// Voter — save their location preference
// ─────────────────────────────────────────────────────────────────
router.put('/:id/update-location', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { voterLocation } = req.body;
    if (!voterLocation)
      return res.status(400).json({ success: false, message: 'voterLocation is required' });

    user.voterLocation = {
      state:       voterLocation.state       || null,
      district:    voterLocation.district    || null,
      subdistrict: voterLocation.subdistrict || null,
      locality:    voterLocation.locality    || null,
      label:       voterLocation.label       || '',
    };
    await user.save();

    res.json({ success: true, message: 'Location updated', data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/:id — generic, after specific
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { name, avatar, department, district } = req.body;
    if (name)       user.name       = name;
    if (avatar)     user.avatar     = avatar;
    if (department) user.department = department;
    if (district)   user.district   = district;

    if (req.user.role === 'admin') {
      if (req.body.role)                   user.role     = req.body.role;
      if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
    }

    await user.save();
    res.json({ success: true, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = false;
    await user.save();
    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


module.exports = router;