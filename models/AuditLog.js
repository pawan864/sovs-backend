const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    action:    { type: String, required: true }, // 'LOGIN' | 'VOTE' | 'CREATE_ELECTION' | 'RESOLVE_INCIDENT' etc
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName:  { type: String, default: 'System' },
    userRole:  { type: String, default: null },
    details:   { type: String, default: '' },
    ipAddress: { type: String, default: null },
    type: {
      type: String,
      enum: ['success', 'info', 'warning', 'error'],
      default: 'info',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', AuditLogSchema);