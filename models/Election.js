const mongoose = require('mongoose');

const CandidateSchema = new mongoose.Schema(
  {
    // matches elections.ts Candidate interface
    name:        { type: String, required: true, trim: true },
    party:       { type: String, required: true, trim: true },
    photo:       { type: String, default: '' },
    description: { type: String, default: '' },
    manifesto:   { type: String, default: '' },
  },
  { _id: true }
);

const ElectionSchema = new mongoose.Schema(
  {
    // matches elections.ts Election interface
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    startDate:   { type: Date,   required: true },
    endDate:     { type: Date,   required: true },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'ended'],
      default: 'upcoming',
    },
    candidates: [CandidateSchema],
    totalVoters: { type: Number, default: 0 },
    turnout:     { type: Number, default: 0 }, // count of votes cast

    // results: candidateId -> vote count
    results: {
      type: Map,
      of: Number,
      default: {},
    },

    // who created this election
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    isActive: { type: Boolean, default: true },

    // ── Eligible voters ───────────────────────────────────────────
    // If empty → open to all (default behavior)
    // If populated → ONLY these voter IDs can see and vote
    eligibleVoters: [{
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    }],
    isRestrictedToEligible: { type: Boolean, default: false }, // toggle

    // ── Election location ──────────────────────────────────────────
    location: {
      state:       { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      district:    { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      subdistrict: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      locality:    { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      // Human-readable label built from selected levels
      label:       { type: String, default: '' },
    },

    // ✅ Which roles can see this election
    visibleTo: {
      type: [String],
      enum: ['voter', 'dm', 'sdm', 'cdo'],
      default: ['voter', 'dm', 'sdm', 'cdo'], // visible to all by default
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        // Convert Map to plain object for frontend compatibility
        if (ret.results instanceof Map) {
          ret.results = Object.fromEntries(ret.results);
        }
        return ret;
      },
      virtuals: true,
    },
  }
);

// Auto-update status based on dates
ElectionSchema.methods.computeStatus = function () {
  const now = new Date();
  if (now < this.startDate) return 'upcoming';
  if (now > this.endDate)   return 'ended';
  return 'active';
};

module.exports = mongoose.model('Election', ElectionSchema);