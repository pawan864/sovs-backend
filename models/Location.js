const mongoose = require('mongoose');

// ── Location Schema ───────────────────────────────────────────────
// Hierarchy: State → District → SubDistrict → Locality
// Each level references its parent
const LocationSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    type:     { 
      type: String, 
      required: true,
      enum: ['state', 'district', 'subdistrict', 'locality'],
    },
    parent:   { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Location', 
      default: null  // null for states (top level)
    },
    code:     { type: String, default: '' }, // optional short code e.g. "UP", "LKO"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Compound index — unique name per type per parent
LocationSchema.index({ name: 1, type: 1, parent: 1 }, { unique: true });

module.exports = mongoose.model('Location', LocationSchema);