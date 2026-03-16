const express  = require('express');
const router   = express.Router();
const Feedback = require('../models/Feedback');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// POST /api/feedback
// Voter — submit feedback or complaint
// ─────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('voter'), async (req, res) => {
  try {
    const { type, subject, message, category, targetRole, electionId, electionTitle } = req.body;

    if (!type || !subject || !message)
      return res.status(400).json({ success: false, message: 'type, subject and message are required' });

    if (!['feedback', 'complaint'].includes(type))
      return res.status(400).json({ success: false, message: 'type must be feedback or complaint' });

    // Complaints must have a targetRole
    if (type === 'complaint' && !targetRole)
      return res.status(400).json({ success: false, message: 'complaint must have a targetRole (dm, sdm, cdo, admin)' });

    const feedback = await Feedback.create({
      type,
      voterId:      req.user._id,
      voterName:    req.user.name,
      voterVoterId: req.user.voterId || '',
      subject:      subject.trim(),
      message:      message.trim(),
      category:     category || 'General',
      targetRole:   type === 'complaint' ? targetRole : null,
      electionId:   electionId   || null,
      electionTitle: electionTitle || '',
    });

    await AuditLog.create({
      action:   type === 'complaint' ? 'COMPLAINT_SUBMITTED' : 'FEEDBACK_SUBMITTED',
      userId:   req.user._id,
      userName: req.user.name,
      userRole: 'voter',
      details:  `${type === 'complaint' ? 'Complaint' : 'Feedback'} submitted: "${subject}"`,
      type:     'info',
    });

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/feedback
// Authorities — get feedback/complaints based on role
// Admin sees everything
// DM/SDM/CDO see: all feedback + complaints targeted to them
// ─────────────────────────────────────────────────────────────────
router.get('/', protect, authorize('admin', 'dm', 'sdm', 'cdo'), async (req, res) => {
  try {
    const { type, status } = req.query;
    let filter = {};

    if (req.user.role === 'admin') {
      // Admin sees everything
      if (type)   filter.type   = type;
      if (status) filter.status = status;
    } else {
      // DM/SDM/CDO: see all feedbacks + complaints targeted to their role
      const roleFilter = [
        { type: 'feedback' },                    // all feedback visible to all authorities
        { type: 'complaint', targetRole: req.user.role }, // complaints targeted to them
      ];
      filter.$or = roleFilter;
      if (status) filter.status = status;
    }

    const feedbacks = await Feedback.find(filter)
      .sort({ createdAt: -1 })
      .populate('voterId', 'name voterId')
      .populate('electionId', 'title');

    res.json({ success: true, count: feedbacks.length, data: feedbacks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/feedback/my
// Voter — get their own feedback/complaints
// ─────────────────────────────────────────────────────────────────
router.get('/my', protect, authorize('voter'), async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ voterId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: feedbacks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/feedback/:id/respond
// Authority — respond to feedback or complaint
// ─────────────────────────────────────────────────────────────────
router.put('/:id/respond', protect, authorize('admin', 'dm', 'sdm', 'cdo'), async (req, res) => {
  try {
    const { response, status } = req.body;
    if (!response)
      return res.status(400).json({ success: false, message: 'Response text is required' });

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback)
      return res.status(404).json({ success: false, message: 'Feedback not found' });

    // Non-admin can only respond to their targeted complaints + all feedbacks
    if (req.user.role !== 'admin') {
      if (feedback.type === 'complaint' && feedback.targetRole !== req.user.role)
        return res.status(403).json({ success: false, message: 'Not authorised to respond to this complaint' });
    }

    feedback.response    = response.trim();
    feedback.respondedBy = req.user.name;
    feedback.respondedAt = new Date();
    feedback.status      = status || 'Reviewed';
    await feedback.save();

    await AuditLog.create({
      action:   'FEEDBACK_RESPONDED',
      userId:   req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      details:  `Responded to ${feedback.type}: "${feedback.subject}"`,
      type:     'success',
    });

    res.json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/feedback/:id
// Admin only — delete feedback
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback)
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;