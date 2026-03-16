const mongoose = require('mongoose');

const NoticeSchema = new mongoose.Schema(
  {
    // ── Target ─────────────────────────────────────────────────────
    targetVoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetName:    { type: String, required: true },

    // ── Content ────────────────────────────────────────────────────
    subject:  { type: String, required: true, trim: true },
    message:  { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['info', 'warning', 'urgent', 'action_required'],
      default: 'info',
    },

    // ── Sender ─────────────────────────────────────────────────────
    sentBy:     { type: String, default: 'Admin' },
    sentByRole: { type: String, default: 'admin' },

    // ── Read status ────────────────────────────────────────────────
    isRead:  { type: Boolean, default: false },
    readAt:  { type: Date,   default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', NoticeSchema);