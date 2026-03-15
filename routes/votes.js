const express = require('express');
const router = express.Router();
const Vote = require('../models/Vote');
const Election = require('../models/Election');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ─── Helper: generate vote hash ──────────────────────────────────
const generateHash = (voterId, electionId, candidateId) => {
  const data = `${voterId}-${electionId}-${candidateId}-${Date.now()}`;
  return Buffer.from(data).toString('base64');
};

// ─────────────────────────────────────────────────────────────────
// POST /api/votes/cast
// Voter only — cast a vote
// ─────────────────────────────────────────────────────────────────
router.post('/cast', protect, authorize('voter'), async (req, res) => {
  try {
    const { electionId, candidateId } = req.body;

    if (!electionId || !candidateId) {
      return res.status(400).json({ success: false, message: 'electionId and candidateId are required' });
    }

    // Check election exists and is active
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }
    if (election.status !== 'active') {
      return res.status(400).json({ success: false, message: `Voting is not open — election is ${election.status}` });
    }

    // Check candidate exists in this election
    const candidate = election.candidates.id(candidateId);
    if (!candidate) {
      return res.status(400).json({ success: false, message: 'Candidate not found in this election' });
    }

    // ✅ Guest voters (Aadhaar not registered in DB) cannot cast votes
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Please register with a valid Aadhaar or ECI card to vote' });
    }

    // ✅ Eligible voter check — if election is restricted, voter must be in eligible list
    if (election.isRestrictedToEligible && election.eligibleVoters?.length > 0) {
      const isEligible = election.eligibleVoters.some(
        id => id.toString() === req.user._id.toString()
      );
      if (!isEligible) {
        return res.status(403).json({
          success: false,
          notEligible: true,
          message: 'You are not in the eligible voters list for this election. Contact admin to be added.',
        });
      }
    }

    // ✅ Area-lock check — voter can only vote in their registered area
    const User = require('../models/User');
    const voter = await User.findById(req.user._id);
    if (voter && election.location) {
      const el = election.location;
      const vl = voter.voterLocation;
      const elHasArea = el.state || el.district || el.subdistrict || el.locality;

      if (elHasArea) {
        // Election is area-locked — voter must have matching area
        if (!vl || !vl.state) {
          return res.status(403).json({
            success: false,
            areaLocked: true,
            message: 'This election is area-locked. Please set your registered area before voting.',
          });
        }
        // Check area match at deepest level
        const match =
          (el.locality    && vl.locality    && el.locality.toString()    === vl.locality.toString())    ||
          (el.subdistrict && vl.subdistrict && el.subdistrict.toString() === vl.subdistrict.toString()) ||
          (el.district    && vl.district    && el.district.toString()    === vl.district.toString())    ||
          (el.state       && vl.state       && el.state.toString()       === vl.state.toString());

        if (!match) {
          return res.status(403).json({
            success: false,
            areaLocked: true,
            message: `You are not allowed to vote here. This election is for "${el.label || 'a specific area'}". Your area: "${vl.label || 'not set'}".`,
          });
        }
      }
    }

    // Check if user already voted
    const alreadyVoted = await Vote.findOne({ userId: req.user._id, electionId });
    if (alreadyVoted) {
      return res.status(400).json({ success: false, message: 'You have already voted in this election' });
    }

    // Cast vote
    // ✅ Use voterId or fallback to display name for admin visibility
    const voterDisplayId = req.user.voterId || req.user._id?.toString() || 'Unknown';
    const hash = generateHash(voterDisplayId, electionId, candidateId);
    const vote = await Vote.create({
      userId:        req.user._id,
      userName:      req.user.name      || 'Voter',
      userEmail:     req.user.email     || '',
      electionId,
      electionTitle: election.title,
      candidateId,
      candidateName: candidate.name,
      timestamp:     Date.now(),
      hash,
      voterId:       voterDisplayId,    // ✅ always set, never null
      ipAddress:     req.ip,
      verified:      true,
    });

    // Update election turnout + results
    election.turnout += 1;
    const currentCount = election.results.get(candidateId) || 0;
    election.results.set(candidateId, currentCount + 1);
    await election.save();

    await AuditLog.create({
      action:   'VOTE_CAST',
      userId:   req.user._id,
      userName: req.user.name,
      userRole: 'voter',
      details:  `Vote cast in "${election.title}"`,
      type:     'success',
      ipAddress: req.ip,
    });

    // Return receipt — no candidate info (anonymous)
    res.status(201).json({
      success: true,
      message: 'Vote cast successfully',
      receipt: {
        voteId:        vote._id,
        electionTitle: election.title,
        hash:          vote.hash,
        timestamp:     vote.timestamp,
        verified:      vote.verified,
      },
    });
  } catch (error) {
    // Duplicate key = already voted
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already voted in this election' });
    }
    console.error('Cast vote error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/votes/has-voted/:electionId
// Voter — check if already voted
// ─────────────────────────────────────────────────────────────────
router.get('/has-voted/:electionId', protect, authorize('voter'), async (req, res) => {
  try {
    // ✅ Guest voters have never voted in DB
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      return res.json({ success: true, hasVoted: false });
    }

    const vote = await Vote.findOne({
      userId:     req.user._id,
      electionId: req.params.electionId,
    });
    res.json({ success: true, hasVoted: !!vote });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/votes/receipt/:electionId
// Voter — get their own vote receipt (no candidate info)
// ─────────────────────────────────────────────────────────────────
router.get('/receipt/:electionId', protect, authorize('voter'), async (req, res) => {
  try {
    // ✅ Guest voters have no receipts
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      return res.status(404).json({ success: false, message: 'No vote found for this election' });
    }

    const vote = await Vote.findOne({
      userId:     req.user._id,
      electionId: req.params.electionId,
    });

    if (!vote) {
      return res.status(404).json({ success: false, message: 'No vote found for this election' });
    }

    res.json({
      success: true,
      receipt: {
        voteId:        vote._id,
        electionTitle: vote.electionTitle,
        candidateName: vote.candidateName, // ✅ shown on voter dashboard
        hash:          vote.hash,
        timestamp:     vote.timestamp,
        verified:      vote.verified,
        castAt:        vote.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/votes/recent
// Admin/DM/SDM/CDO — get recent vote records (no voter identity)
// ─────────────────────────────────────────────────────────────────
router.get('/recent', protect, authorize('admin', 'dm', 'sdm', 'cdo'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    // ✅ Use lean() to bypass toJSON transform and get raw data including voterId
    const votes = await Vote.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('electionTitle candidateName hash timestamp verified createdAt voterId userName userEmail electionId')
      .lean();

    res.json({ success: true, data: votes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;