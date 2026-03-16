const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const mongoose   = require('mongoose');
const Election   = require('../models/Election');
const Vote       = require('../models/Vote');
const User       = require('../models/User');
const AuditLog   = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ── optionalProtect middleware ────────────────────────────────────
const optionalProtect = async (req, res, next) => {
  req.userRole = null;
  req.userId   = null;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  try {
    const token   = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userRole  = decoded.role || null;
    req.userId    = decoded.id   || null;
    if (!req.userRole && req.userId && mongoose.Types.ObjectId.isValid(req.userId)) {
      const user = await User.findById(req.userId).select('role _id');
      if (user) { req.userRole = user.role; req.userId = user._id.toString(); }
    }
  } catch {}
  next();
};

// ─────────────────────────────────────────────────────────────────
// GET /api/elections
// ─────────────────────────────────────────────────────────────────
router.get('/', optionalProtect, async (req, res) => {
  try {
    const elections = await Election.find({ isActive: true }).sort({ startDate: -1 });

    for (const election of elections) {
      const computed = election.computeStatus();
      if (computed !== election.status) { election.status = computed; await election.save(); }
    }

    const { userRole, userId } = req;
    let filtered = elections;

    if (userRole && userRole !== 'admin') {
      filtered = elections.filter(e => {
        if (!e.visibleTo || e.visibleTo.length === 0) return true;
        return e.visibleTo.includes(userRole);
      });
    }

    if (userRole === 'voter' && userId && mongoose.Types.ObjectId.isValid(userId)) {
      filtered = filtered.filter(e => {
        if (!e.isRestrictedToEligible) return true;
        return e.eligibleVoters?.some(id => id.toString() === userId);
      });
    }

    if (userRole === 'voter' && userId && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const voter = await User.findById(userId).select('voterLocation');
        const vl    = voter?.voterLocation;
        if (vl && (vl.state || vl.district || vl.subdistrict || vl.locality)) {
          filtered = filtered.filter(e => {
            const el = e.location;
            if (!el || (!el.state && !el.district && !el.subdistrict && !el.locality)) return true;
            if (el.locality)    return el.locality.toString()    === vl.locality?.toString();
            if (el.subdistrict) return el.subdistrict.toString() === vl.subdistrict?.toString();
            if (el.district)    return el.district.toString()    === vl.district?.toString();
            if (el.state)       return el.state.toString()       === vl.state?.toString();
            return true;
          });
        }
      } catch (locErr) { console.warn('[Elections] Location filter error:', locErr.message); }
    }

    res.json({ success: true, data: filtered });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/elections/:id/results
// ─────────────────────────────────────────────────────────────────
router.get('/:id/results', async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const totalVotesCast = await Vote.countDocuments({ electionId: req.params.id });
    const results = {};
    for (const candidate of election.candidates) {
      const count = await Vote.countDocuments({ electionId: req.params.id, candidateId: candidate._id.toString() });
      results[candidate._id.toString()] = count;
    }
    const turnoutPct = election.totalVoters > 0 ? ((totalVotesCast / election.totalVoters) * 100).toFixed(1) : '0.0';
    res.json({ success: true, data: { electionId: election._id, title: election.title, status: election.status, totalVoters: election.totalVoters, totalVotesCast, turnoutPercent: turnoutPct, results, candidates: election.candidates } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/elections/:id/eligible-voters  — Admin
// ─────────────────────────────────────────────────────────────────
router.get('/:id/eligible-voters', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
      .populate('eligibleVoters', 'name voterId aadhaarNumber eciCardNumber voterLocation');
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    res.json({ success: true, data: election.eligibleVoters, isRestricted: election.isRestrictedToEligible });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/elections/:id/candidates
// ─────────────────────────────────────────────────────────────────
router.get('/:id/candidates', async (req, res) => {
  try {
    const election = await Election.findById(req.params.id).select('candidates title status');
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    res.json({ success: true, data: election.candidates });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/elections/:id  — MUST be after all /:id/sub-routes
// ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const computed = election.computeStatus();
    if (computed !== election.status) { election.status = computed; await election.save(); }
    res.json({ success: true, data: election });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/elections  — Admin create
// ─────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { title, description, startDate, endDate, totalVoters, candidates, visibleTo, location } = req.body;
    if (!title || !description || !startDate || !endDate)
      return res.status(400).json({ success: false, message: 'Title, description, startDate and endDate are required' });
    const election = await Election.create({
      title, description,
      startDate:   new Date(startDate),
      endDate:     new Date(endDate),
      totalVoters: totalVoters || 0,
      candidates:  candidates  || [],
      location:    location    || {},
      visibleTo:   visibleTo   || ['voter', 'dm', 'sdm', 'cdo'],
      createdBy:   req.user._id,
    });
    election.status = election.computeStatus();
    await election.save();
    await AuditLog.create({ action: 'CREATE_ELECTION', userId: req.user._id, userName: req.user.name, userRole: req.user.role, details: `Election created: "${election.title}"`, type: 'success' });
    res.status(201).json({ success: true, data: election });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/elections/:id/candidates  — Admin add candidate
// ─────────────────────────────────────────────────────────────────
router.post('/:id/candidates', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const { name, party, symbol, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Candidate name is required' });
    election.candidates.push({ name, party, symbol, description });
    await election.save();
    await AuditLog.create({ action: 'ADD_CANDIDATE', userId: req.user._id, userName: req.user.name, userRole: req.user.role, details: `Candidate "${name}" added to "${election.title}"`, type: 'info' });
    res.status(201).json({ success: true, data: election });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/elections/:id/eligible-voters  — Admin
// ─────────────────────────────────────────────────────────────────
router.post('/:id/eligible-voters', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const { voterId } = req.body;
    if (!voterId) return res.status(400).json({ success: false, message: 'voterId required' });
    const voter = await User.findById(voterId);
    if (!voter || voter.role !== 'voter') return res.status(404).json({ success: false, message: 'Voter not found' });
    if (election.eligibleVoters.some(id => id.toString() === voterId))
      return res.status(400).json({ success: false, message: 'Voter already in eligible list' });
    election.eligibleVoters.push(voterId);
    election.isRestrictedToEligible = true;
    await election.save();
    res.json({ success: true, data: election });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/elections/:id/visibility  — Admin
// ─────────────────────────────────────────────────────────────────
router.put('/:id/visibility', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const { visibleTo } = req.body;
    if (!Array.isArray(visibleTo)) return res.status(400).json({ success: false, message: 'visibleTo must be an array' });
    election.visibleTo = visibleTo;
    await election.save();
    res.json({ success: true, data: election });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/elections/:id/restrict  — Admin toggle restriction
// ─────────────────────────────────────────────────────────────────
router.put('/:id/restrict', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    election.isRestrictedToEligible = req.body.isRestricted ?? !election.isRestrictedToEligible;
    await election.save();
    res.json({ success: true, data: election, message: `Restriction ${election.isRestrictedToEligible ? 'enabled' : 'disabled'}` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/elections/:id  — Admin update election details
// ─────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const { title, description, startDate, endDate, totalVoters, candidates, visibleTo, location } = req.body;
    if (title)       election.title       = title;
    if (description) election.description = description;
    if (startDate)   election.startDate   = new Date(startDate);
    if (endDate)     election.endDate     = new Date(endDate);
    if (totalVoters !== undefined) election.totalVoters = totalVoters;
    if (candidates)  election.candidates  = candidates;
    if (location)    election.location    = location;
    if (visibleTo)   election.visibleTo   = visibleTo;
    election.status = election.computeStatus();
    await election.save();
    await AuditLog.create({ action: 'UPDATE_ELECTION', userId: req.user._id, userName: req.user.name, userRole: req.user.role, details: `Election updated: "${election.title}"`, type: 'info' });
    res.json({ success: true, data: election });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/elections/:id/candidates/:candidateId  — Admin
// ─────────────────────────────────────────────────────────────────
router.delete('/:id/candidates/:candidateId', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const before = election.candidates.length;
    election.candidates = election.candidates.filter(c => c._id.toString() !== req.params.candidateId);
    if (election.candidates.length === before)
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    await election.save();
    res.json({ success: true, data: election });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/elections/:id/eligible-voters/:voterId  — Admin
// ─────────────────────────────────────────────────────────────────
router.delete('/:id/eligible-voters/:voterId', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    election.eligibleVoters = election.eligibleVoters.filter(id => id.toString() !== req.params.voterId);
    if (election.eligibleVoters.length === 0) election.isRestrictedToEligible = false;
    await election.save();
    res.json({ success: true, data: election });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/elections/:id  — Admin soft delete
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    election.isActive = false;
    await election.save();
    await AuditLog.create({ action: 'DELETE_ELECTION', userId: req.user._id, userName: req.user.name, userRole: req.user.role, details: `Election deleted: "${election.title}"`, type: 'warning' });
    res.json({ success: true, message: 'Election deleted' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;