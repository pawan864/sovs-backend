const express = require('express');
const router = express.Router();
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// GET /api/incidents — all (admin, dm, sdm, cdo)
router.get('/', protect, authorize('admin', 'dm', 'sdm', 'cdo'), async (req, res) => {
  try {
    const { district, status } = req.query;
    const filter = {};
    if (district) filter.district = district;
    if (status)   filter.status = status;

    // DM/SDM can only see their own district
    if (['dm', 'sdm'].includes(req.user.role) && req.user.district) {
      filter.district = req.user.district;
    }

    const incidents = await Incident.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/incidents — create (dm, sdm, admin)
router.post('/', protect, authorize('admin', 'dm', 'sdm'), async (req, res) => {
  try {
    const { boothId, boothName, type, severity, district, notes } = req.body;

    if (!boothId || !boothName || !type) {
      return res.status(400).json({ success: false, message: 'boothId, boothName, type are required' });
    }

    const incident = await Incident.create({
      boothId, boothName, type,
      severity: severity || 'Medium',
      district:  district || req.user.district,
      reportedBy: req.user._id,
      notes,
    });

    await AuditLog.create({
      action: 'CREATE_INCIDENT', userId: req.user._id,
      userName: req.user.name, userRole: req.user.role,
      details: `Incident reported at ${boothName}: ${type}`, type: 'warning',
    });

    res.status(201).json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/incidents/:id/resolve — resolve incident
router.put('/:id/resolve', protect, authorize('admin', 'dm', 'sdm'), async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });

    incident.status     = 'Resolved';
    incident.resolvedBy = req.user._id;
    incident.resolvedAt = new Date();
    if (req.body.notes) incident.notes = req.body.notes;
    await incident.save();

    await AuditLog.create({
      action: 'RESOLVE_INCIDENT', userId: req.user._id,
      userName: req.user.name, userRole: req.user.role,
      details: `Incident ${incident._id} resolved at ${incident.boothName}`, type: 'success',
    });

    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;