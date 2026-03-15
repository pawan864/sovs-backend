require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const User     = require('../models/User');
const Election = require('../models/Election');
const Vote     = require('../models/Vote');
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');

const USERS = [
  {
    voterId: 'VTR-001-2026',
    name:    'John Voter',
    email:   'voter@example.com',
    password: '',
    role:    'voter',
    aadhaarNumber: '1234-5678-9012',
    eciCardNumber: 'ECI-VTR-001',
    avatar:  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
  },
  {
    voterId:    'VTR-002-2026',
    name:       'Raj Sharma',
    email:      'admin@securevote.gov.in',
    password:   'Admin@1234',
    role:       'admin',
    department: 'System Administration',
    avatar:     'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
  },
  {
    voterId:    'VTR-003-2026',
    name:       'Priya Verma',
    email:      'dm@securevote.gov.in',
    password:   'DM@5678',
    role:       'dm',
    district:   'Lucknow',
    department: 'District Management',
    avatar:     'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
  },
  {
    voterId:    'VTR-004-2026',
    name:       'Amit Tiwari',
    email:      'sdm@securevote.gov.in',
    password:   'SDM@9012',
    role:       'sdm',
    district:   'Lucknow',
    department: 'Sub-District Operations',
    avatar:     'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
  },
  {
    voterId:    'VTR-005-2026',
    name:       'Sunita Pandey',
    email:      'cdo@securevote.gov.in',
    password:   'CDO@3456',
    role:       'cdo',
    district:   'Lucknow',
    department: 'Chief Development Office',
    avatar:     'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
  },
];

const ELECTIONS = [
  {
    title:       '2026 Presidential Election',
    description: 'National presidential election to elect the next president for a 4-year term.',
    startDate:   new Date('2026-02-01'),
    endDate:     new Date('2026-03-15'),
    status:      'active',
    totalVoters: 15000,
    turnout:     8500,
    candidates: [
      { name: 'Sarah Johnson',    party: 'Progressive Party',    photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400', description: 'Former Governor with 15 years of public service', manifesto: 'Focus on education, healthcare, and economic growth' },
      { name: 'Michael Chen',     party: 'Conservative Alliance', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', description: 'Business leader and philanthropist', manifesto: 'Strengthening national security and economic stability' },
      { name: 'Amanda Rodriguez', party: 'Green Coalition',       photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400', description: 'Environmental scientist and activist', manifesto: 'Climate action, renewable energy, and sustainability' },
    ],
  },
  {
    title:       'City Council Election - District 5',
    description: 'Local council election for District 5 representative.',
    startDate:   new Date('2026-03-01'),
    endDate:     new Date('2026-03-30'),
    status:      'active',
    totalVoters: 5000,
    turnout:     1200,
    candidates: [
      { name: 'David Wilson',  party: 'Independent',    photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400', description: 'Community organizer and local business owner', manifesto: 'Infrastructure development and community services' },
      { name: 'Lisa Martinez', party: 'Citizens Party', photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400', description: 'Education administrator with 20 years experience', manifesto: 'Better schools and public transportation' },
    ],
  },
  {
    title:       'Student Government President',
    description: 'University student government presidential election.',
    startDate:   new Date('2026-04-01'),
    endDate:     new Date('2026-04-15'),
    status:      'upcoming',
    totalVoters: 12000,
    turnout:     0,
    candidates: [
      { name: 'Alex Thompson', party: 'Student Voice',   photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400', description: 'Current VP with vision for student welfare', manifesto: 'Mental health support and campus facilities' },
      { name: 'Emily Zhang',   party: 'Unity Coalition', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400', description: 'Student activist and club leader', manifesto: 'Diversity initiatives and student activities' },
    ],
  },
];

const INCIDENTS = [
  { boothId: 'B004', boothName: 'Booth 4 — Chinhat',  type: 'Disturbance',  severity: 'High',   status: 'Open',     district: 'Lucknow' },
  { boothId: 'B002', boothName: 'Booth 2 — Alambagh', type: 'EVM Glitch',   severity: 'Medium', status: 'Resolved', district: 'Lucknow' },
  { boothId: 'B006', boothName: 'Booth 6 — Amausi',   type: 'Power Outage', severity: 'High',   status: 'Resolved', district: 'Lucknow' },
];

const seed = async () => {
  try {
    // ✅ Always use securevote database — never fallback to bare URI
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/securevote';
    console.log(`🔗 Connecting to MongoDB: ${uri.replace(/:([^@]+)@/, ':****@')}`);
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
    console.log(`📦 Database: ${mongoose.connection.name}`);

    console.log('🧹 Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Election.deleteMany({}),
      Vote.deleteMany({}),
      Incident.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
    console.log('✅ Collections cleared');

    // ── Seed Users ─────────────────────────────────────────────────
    // pre-save hook in User.js handles password hashing automatically
    console.log('👥 Seeding users...');
    const createdUsers = [];
    for (const userData of USERS) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`   ✔ ${user.role.toUpperCase()}: ${user.email}`);
    }

    // ── Seed Elections ─────────────────────────────────────────────
    console.log('🗳️  Seeding elections...');
    const adminUser = createdUsers.find(u => u.role === 'admin');
    const createdElections = [];
    for (const electionData of ELECTIONS) {
      const election = new Election({ ...electionData, createdBy: adminUser._id });
      await election.save();
      election.candidates.forEach((c, i) => {
        const votes = i === 0 ? Math.floor(electionData.turnout * 0.45)
                    : i === 1 ? Math.floor(electionData.turnout * 0.35)
                    :           Math.floor(electionData.turnout * 0.20);
        election.results.set(c._id.toString(), votes);
      });
      await election.save();
      createdElections.push(election);
      console.log(`   ✔ ${election.title} (${election.status})`);
    }

    // ── Seed Incidents ─────────────────────────────────────────────
    console.log('⚠️  Seeding incidents...');
    const dmUser = createdUsers.find(u => u.role === 'dm');
    for (const incData of INCIDENTS) {
      await Incident.create({ ...incData, reportedBy: dmUser._id });
      console.log(`   ✔ ${incData.boothName}: ${incData.type} (${incData.status})`);
    }

    // ── Seed Audit Logs ────────────────────────────────────────────
    console.log('📋 Seeding audit logs...');
    await AuditLog.insertMany([
      { action: 'SYSTEM_START',       userName: 'System',    details: 'SecureVote backend started',           type: 'info',    createdAt: new Date(Date.now() - 2 * 3600000) },
      { action: 'ELECTION_ACTIVATED', userName: 'System',    details: '2026 Presidential Election activated', type: 'success', createdAt: new Date(Date.now() - 2 * 3600000) },
      { action: 'INCIDENT_REPORTED',  userName: dmUser.name, userRole: 'dm', details: 'Incident at Booth 4 — Chinhat', type: 'warning', createdAt: new Date(Date.now() - 22 * 60000) },
      { action: 'BLOCKCHAIN_SYNC',    userName: 'System',    details: 'Blockchain sync completed',            type: 'success', createdAt: new Date(Date.now() - 2 * 60000) },
    ]);
    console.log('   ✔ Audit logs seeded');

    console.log('\n🎉 Database seeded successfully!');
    console.log('─────────────────────────────────────────────');
    console.log('📧 Login Credentials:');
    console.log('   ADMIN  admin@securevote.gov.in  / Admin@1234');
    console.log('   DM     dm@securevote.gov.in     / DM@5678');
    console.log('   SDM    sdm@securevote.gov.in    / SDM@9012');
    console.log('   CDO    cdo@securevote.gov.in    / CDO@3456');
    console.log('   VOTER  OTP flow → OTP: 123456');
    console.log('─────────────────────────────────────────────\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seed();