const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['feedback', 'complaint'],
      required: true,
    },

    // ── Voter info ─────────────────────────────────────────────────
    voterId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    voterName: { type: String, required: true },
    voterVoterId: { type: String, default: '' }, // VTR-XXX-2026

    // ── Content ────────────────────────────────────────────────────
    subject:  { type: String, required: true, trim: true },
    message:  { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['General', 'EVM Issue', 'Booth Issue', 'Staff Behaviour', 'Process Issue', 'Other'],
      default: 'General',
    },

    // ── Complaint routing ──────────────────────────────────────────
    // For complaints: which role should see it
    targetRole: {
      type: String,
      enum: ['dm', 'sdm', 'cdo', 'admin', null],
      default: null, // null = feedback (visible to all authorities)
    },

    // ── Status ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['Pending', 'Reviewed', 'Resolved', 'Dismissed'],
      default: 'Pending',
    },

    // ── Response from authority ────────────────────────────────────
    response:     { type: String, default: '' },
    respondedBy:  { type: String, default: '' },
    respondedAt:  { type: Date,   default: null },

    // ── Election reference (optional) ──────────────────────────────
    electionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Election', default: null },
    electionTitle: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', FeedbackSchema);