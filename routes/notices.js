const express = require('express');
const router  = express.Router();
const Notice  = require('../models/Notice');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// POST /api/notices
// Admin — send a notice to a specific voter
// ─────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { targetVoterId, targetName, subject, message, type } = req.body;
    if (!targetVoterId || !subject || !message)
      return res.status(400).json({ success: false, message: 'targetVoterId, subject and message are required' });

    const notice = await Notice.create({
      targetVoterId,
      targetName: targetName || 'Voter',
      subject:    subject.trim(),
      message:    message.trim(),
      type:       type || 'info',
      sentBy:     req.user.name,
      sentByRole: req.user.role,
    });

    await AuditLog.create({
      action:   'NOTICE_SENT',
      userId:   req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      details:  `Notice sent to ${targetName}: "${subject}"`,
      type:     'info',
    });

    res.status(201).json({ success: true, data: notice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/notices
// Admin — get all notices
// ─────────────────────────────────────────────────────────────────
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { voterId } = req.query;
    const filter = voterId ? { targetVoterId: voterId } : {};
    const notices = await Notice.find(filter)
      .sort({ createdAt: -1 })
      .populate('targetVoterId', 'name voterId');
    res.json({ success: true, count: notices.length, data: notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/notices/my
// Voter — get their own notices
// ─────────────────────────────────────────────────────────────────
router.get('/my', protect, authorize('voter'), async (req, res) => {
  try {
    const notices = await Notice.find({ targetVoterId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/notices/:id/read
// Voter — mark notice as read
// ─────────────────────────────────────────────────────────────────
router.put('/:id/read', protect, authorize('voter'), async (req, res) => {
  try {
    const notice = await Notice.findOneAndUpdate(
      { _id: req.params.id, targetVoterId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });
    res.json({ success: true, data: notice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/notices/:id
// Admin — delete a notice
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Notice deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/votes/admin/:electionId/:userId
// Admin — reset a voter's vote (mark as non-voted)
// ─────────────────────────────────────────────────────────────────
module.exports = router;