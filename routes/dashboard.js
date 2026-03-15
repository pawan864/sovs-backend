const express = require('express');
const router = express.Router();
const Election = require('../models/Election');
const Vote = require('../models/Vote');
const User = require('../models/User');
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/admin
// Admin overview stats
// ─────────────────────────────────────────────────────────────────
router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const [totalElections, activeElections, totalVoters, totalVotesCast, flaggedIncidents, recentLogs] =
      await Promise.all([
        Election.countDocuments({ isActive: true }),
        Election.countDocuments({ status: 'active', isActive: true }),
        User.countDocuments({ role: 'voter', isActive: true }),
        Vote.countDocuments(),
        Incident.countDocuments({ status: 'Open' }),
        AuditLog.find().sort({ createdAt: -1 }).limit(10),
      ]);

    const turnoutPct = totalVoters > 0
      ? ((totalVotesCast / totalVoters) * 100).toFixed(1)
      : '0.0';

    res.json({
      success: true,
      data: {
        totalElections,
        activeElections,
        totalVoters,
        totalVotesCast,
        turnoutPercent: turnoutPct,
        flaggedIncidents,
        recentLogs,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/dm
// DM — district level stats
// ─────────────────────────────────────────────────────────────────
router.get('/dm', protect, authorize('admin', 'dm'), async (req, res) => {
  try {
    const district = req.user.district;

    const [totalVotesCast, openIncidents, totalIncidents] = await Promise.all([
      Vote.countDocuments(),
      Incident.countDocuments({ status: 'Open', district }),
      Incident.countDocuments({ district }),
    ]);

    const allElections = await Election.find({ isActive: true, status: 'active' });
    const totalVoters  = allElections.reduce((s, e) => s + e.totalVoters, 0);
    const turnoutPct   = totalVoters > 0 ? ((totalVotesCast / totalVoters) * 100).toFixed(1) : '0.0';

    const incidents = await Incident.find({ district }).sort({ createdAt: -1 }).limit(10);

    res.json({
      success: true,
      data: {
        district,
        totalVotesCast,
        totalVoters,
        turnoutPercent: turnoutPct,
        openIncidents,
        totalIncidents,
        incidents,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/sdm
// SDM — sub-district / ward level stats
// ─────────────────────────────────────────────────────────────────
router.get('/sdm', protect, authorize('admin', 'sdm'), async (req, res) => {
  try {
    const district = req.user.district;

    const [totalVoters, totalVotesCast, openIncidents] = await Promise.all([
      User.countDocuments({ role: 'voter', isActive: true }),
      Vote.countDocuments(),
      Incident.countDocuments({ status: 'Open', district }),
    ]);

    const turnoutPct = totalVoters > 0 ? ((totalVotesCast / totalVoters) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: {
        district,
        totalVoters,
        totalVotesCast,
        turnoutPercent: turnoutPct,
        openIncidents,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/cdo
// CDO — development and budget overview
// ─────────────────────────────────────────────────────────────────
router.get('/cdo', protect, authorize('admin', 'cdo'), async (req, res) => {
  try {
    const district = req.user.district;

    const [totalVoters, totalVotesCast, totalElections] = await Promise.all([
      User.countDocuments({ role: 'voter', isActive: true }),
      Vote.countDocuments(),
      Election.countDocuments({ isActive: true }),
    ]);

    const avgTurnout = totalVoters > 0 ? ((totalVotesCast / totalVoters) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: {
        district,
        totalVoters,
        totalVotesCast,
        avgTurnout,
        totalElections,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard/voter
// Voter — personal stats
// ─────────────────────────────────────────────────────────────────
router.get('/voter', protect, authorize('voter'), async (req, res) => {
  try {
    const [activeElections, upcomingElections, endedElections, votesCast] = await Promise.all([
      Election.countDocuments({ status: 'active', isActive: true }),
      Election.countDocuments({ status: 'upcoming', isActive: true }),
      Election.countDocuments({ status: 'ended', isActive: true }),
      Vote.countDocuments({ userId: req.user._id }),
    ]);

    res.json({
      success: true,
      data: {
        activeElections,
        upcomingElections,
        endedElections,
        votesCast,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;