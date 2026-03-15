const express  = require('express');
const router   = express.Router();
const Location = require('../models/Location');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// GET /api/locations?type=state
// GET /api/locations?type=district&parent=<stateId>
// GET /api/locations?type=subdistrict&parent=<districtId>
// GET /api/locations?type=locality&parent=<subdistrictId>
// Public — anyone can fetch locations
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, parent } = req.query;
    const filter = { isActive: true };
    if (type)   filter.type   = type;
    if (parent) filter.parent = parent;
    else if (type === 'state') filter.parent = null;

    const locations = await Location.find(filter)
      .sort({ name: 1 })
      .populate('parent', 'name type');

    res.json({ success: true, data: locations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/locations/hierarchy/:id
// Get full path: Locality → SubDistrict → District → State
// ─────────────────────────────────────────────────────────────────
router.get('/hierarchy/:id', async (req, res) => {
  try {
    const hierarchy = [];
    let current = await Location.findById(req.params.id);
    while (current) {
      hierarchy.unshift({ _id: current._id, name: current.name, type: current.type });
      current = current.parent ? await Location.findById(current.parent) : null;
    }
    res.json({ success: true, data: hierarchy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/locations
// Admin only — create a location
// ─────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, type, parent, code } = req.body;
    if (!name || !type)
      return res.status(400).json({ success: false, message: 'Name and type are required' });

    const validTypes = ['state', 'district', 'subdistrict', 'locality'];
    if (!validTypes.includes(type))
      return res.status(400).json({ success: false, message: 'Invalid type' });

    // States must not have parent; others must
    if (type === 'state' && parent)
      return res.status(400).json({ success: false, message: 'States cannot have a parent' });
    if (type !== 'state' && !parent)
      return res.status(400).json({ success: false, message: `${type} must have a parent` });

    const location = await Location.create({ name: name.trim(), type, parent: parent || null, code: code || '' });

    await AuditLog.create({
      action: 'CREATE_LOCATION', userId: req.user._id,
      userName: req.user.name, userRole: req.user.role,
      details: `${type} "${name}" created`, type: 'success',
    });

    res.status(201).json({ success: true, data: location });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ success: false, message: 'This location already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/locations/:id
// Admin only — update name/code
// ─────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, code } = req.body;
    const location = await Location.findById(req.params.id);
    if (!location)
      return res.status(404).json({ success: false, message: 'Location not found' });

    if (name) location.name = name.trim();
    if (code !== undefined) location.code = code;
    await location.save();

    res.json({ success: true, data: location });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/locations/:id
// Admin only — soft delete
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location)
      return res.status(404).json({ success: false, message: 'Location not found' });

    location.isActive = false;
    await location.save();

    res.json({ success: true, message: `${location.name} removed` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;