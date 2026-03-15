const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    voterId:    { type: String, required: true, unique: true, trim: true },
    name:       { type: String, required: true, trim: true },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:   { type: String, default: '' },
    role:       { type: String, enum: ['voter', 'admin', 'dm', 'sdm', 'cdo'], required: true, default: 'voter' },
    department: { type: String, default: null },
    district:   { type: String, default: null },
    avatar:     { type: String, default: null },
    otp: {
      code:      { type: String, default: null },
      expiresAt: { type: Date,   default: null },
    },
    // sparse: true means nulls are NOT indexed — fixes the duplicate null error
    aadhaarNumber: { type: String, default: null, sparse: true },  // ✅ removed select:false
    eciCardNumber: { type: String, default: null, sparse: true },  // ✅ removed select:false
    isActive:   { type: Boolean, default: true },

    // ── Voter's location ─────────────────────────────────────────
    voterLocation: {
      state:       { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      district:    { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      subdistrict: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      locality:    { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
      label:       { type: String, default: '' },
    },

    // ── Voter blocking ────────────────────────────────────────────
    isBlocked:    { type: Boolean, default: false },
    blockedReason:{ type: String,  default: null },
    blockedAt:    { type: Date,    default: null },
    blockedBy:    { type: String,  default: null }, // admin name
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;   // ✅ always hide password
        delete ret.otp;        // ✅ always hide otp
        // ✅ Keep aadhaarNumber and eciCardNumber — voter needs to see their own ID
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Mongoose 7+: async pre hooks do NOT use next()
UserSchema.pre('save', async function() {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = function(candidatePassword) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);