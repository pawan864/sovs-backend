const mongoose = require('mongoose');

const VoteSchema = new mongoose.Schema(
  {
    // matches elections.ts VoteRecord interface
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName:       { type: String, required: true },
    userEmail:      { type: String, required: true },
    electionId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
    electionTitle:  { type: String, required: true },
    candidateId:    { type: String, required: true }, // candidate _id string from Election.candidates
    candidateName:  { type: String, required: true },
    timestamp:      { type: Number, default: () => Date.now() },
    hash:           { type: String, required: true }, // cryptographic hash

    // extra security fields
    voterId:        { type: String, required: true }, // voter's voterId (VTR-XXX-2026)
    ipAddress:      { type: String, default: null },
    verified:       { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        // Never expose who voted for whom — only expose hash + election
        delete ret.candidateId;
        delete ret.userId;
        delete ret.userEmail;
        delete ret.ipAddress;
        return ret;
      },
    },
  }
);

// Compound unique index — one vote per user per election
VoteSchema.index({ userId: 1, electionId: 1 }, { unique: true });

module.exports = mongoose.model('Vote', VoteSchema);