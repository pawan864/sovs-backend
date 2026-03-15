const mongoose = require('mongoose');

const IncidentSchema = new mongoose.Schema(
  {
    boothId:    { type: String, required: true },
    boothName:  { type: String, required: true },
    type:       { type: String, required: true }, // 'Disturbance' | 'EVM Glitch' | 'Power Outage' etc
    severity:   { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status:     { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
    district:   { type: String, required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    notes:      { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Incident', IncidentSchema);