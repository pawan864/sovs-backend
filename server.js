require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const connectDB  = require('./config/db');

// ── Connect to MongoDB ────────────────────────────────────────────
connectDB();

const app = express();

// ── Trust proxy (required for Render/Heroku deployments) ─────────
app.set('trust proxy', 1);

// ── Security Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

// Rate limiting — 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests — please try again later' },
});
app.use('/api/', limiter);

// Stricter limit on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts — please try again later' },
});
app.use('/api/auth/', authLimiter);

// ── Body Parser ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Logger (dev only) ─────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/elections',  require('./routes/elections'));
app.use('/api/votes',      require('./routes/votes'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/incidents',  require('./routes/incidents'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/locations',  require('./routes/locations'));

// ── Health Check ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'SecureVote API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── 404 Handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start Server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5001; // ✅ Fixed fallback port
app.listen(PORT, () => {
  console.log(`\n🚀 SecureVote API running on http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV}`);
  console.log(`\n📌 Available Routes:`);
  console.log(`   POST   /api/auth/login`);
  console.log(`   POST   /api/auth/voter/send-otp`);
  console.log(`   POST   /api/auth/voter/verify-otp`);
  console.log(`   GET    /api/auth/me`);
  console.log(`   GET    /api/elections`);
  console.log(`   POST   /api/elections          (admin)`);
  console.log(`   GET    /api/elections/:id/results`);
  console.log(`   POST   /api/votes/cast          (voter)`);
  console.log(`   GET    /api/votes/has-voted/:id  (voter)`);
  console.log(`   GET    /api/votes/receipt/:id    (voter)`);
  console.log(`   GET    /api/dashboard/admin`);
  console.log(`   GET    /api/dashboard/dm`);
  console.log(`   GET    /api/dashboard/sdm`);
  console.log(`   GET    /api/dashboard/cdo`);
  console.log(`   GET    /api/dashboard/voter`);
  console.log(`   GET    /api/incidents`);
  console.log(`   PUT    /api/incidents/:id/resolve`);
  console.log(`   GET    /api/health\n`);
});