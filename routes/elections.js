const express = require('express');
const router = express.Router();
const Election = require('../models/Election');
const Vote = require('../models/Vote');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// GET /api/elections
// Public — all elections (auto-updates status)
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const elections = await Election.find({ isActive: true }).sort({ startDate: -1 });

    for (const election of elections) {
      const computed = election.computeStatus();
      if (computed !== election.status) {
        election.status = computed;
        await election.save();
      }
    }

    let userRole = null;
    let userId   = null;

    if (req.headers.authorization) {
      try {
        const jwt     = require('jsonwebtoken');
        const token   = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role) {
          userRole = decoded.role;
          userId   = decoded.id || null;
        } else if (decoded.id) {
          const mongoose = require('mongoose');
          if (mongoose.Types.ObjectId.isValid(decoded.id)) {
            const User = require('../models/User');
            const user = await User.findById(decoded.id);
            if (user) {
              userRole = user.role;
              userId   = user._id?.toString();
            }
          }
        }
      } catch {}
    }

    let filtered = elections;

    if (userRole && userRole !== 'admin') {
      filtered = elections.filter(e => {
        if (!e.visibleTo || e.visibleTo.length === 0) return true;
        return e.visibleTo.includes(userRole);
      });
    }

    if (userRole === 'voter' && userId) {
      const mongoose2 = require('mongoose');
      if (mongoose2.Types.ObjectId.isValid(userId)) {
        filtered = filtered.filter(e => {
          if (!e.isRestrictedToEligible) return true;
          return e.eligibleVoters?.some(id => id.toString() === userId);
        });
      }
    }

    res.json({ success: true, data: filtered });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// GET /api/elections/:id/results
// Public — get live results
// ─────────────────────────────────────────────────────────────────
router.get('/:id/results', async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);

    if (!election)
      return res.status(404).json({ success: false, message: 'Election not found' });

    const totalVotesCast = await Vote.countDocuments({ electionId: req.params.id });

    const results = {};
    for (const candidate of election.candidates) {
      const count = await Vote.countDocuments({
        electionId: req.params.id,
        candidateId: candidate._id.toString()
      });

      results[candidate._id.toString()] = count;
    }

    res.json({
      success: true,
      data: {
        electionId: election._id,
        title: election.title,
        status: election.status,
        totalVotesCast,
        results,
        candidates: election.candidates
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// GET /api/elections/:id/candidates
// ─────────────────────────────────────────────────────────────────
router.get('/:id/candidates', async (req, res) => {
  try {

    const election = await Election.findById(req.params.id)
      .select('candidates title status');

    if (!election)
      return res.status(404).json({ success: false, message: 'Election not found' });

    res.json({
      success: true,
      data: election.candidates
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// POST /api/elections/:id/candidates
// Admin — add candidate
// ─────────────────────────────────────────────────────────────────
router.post('/:id/candidates', protect, authorize('admin'), async (req, res) => {
  try {

    const election = await Election.findById(req.params.id);

    if (!election)
      return res.status(404).json({ success: false, message: 'Election not found' });

    const { name, party, symbol } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: 'Candidate name required' });

    const candidate = {
      name,
      party: party || '',
      symbol: symbol || ''
    };

    election.candidates.push(candidate);

    await election.save();

    res.json({
      success: true,
      message: 'Candidate added successfully',
      data: election.candidates
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// DELETE candidate
// ─────────────────────────────────────────────────────────────────
router.delete('/:id/candidates/:candidateId', protect, authorize('admin'), async (req, res) => {
  try {

    const election = await Election.findById(req.params.id);

    if (!election)
      return res.status(404).json({ success: false, message: 'Election not found' });

    election.candidates = election.candidates.filter(
      c => c._id.toString() !== req.params.candidateId
    );

    await election.save();

    res.json({
      success: true,
      data: election
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;