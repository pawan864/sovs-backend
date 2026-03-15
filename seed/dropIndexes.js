/**
 * dropIndexes.js
 * Run ONCE to clear stale indexes from previous schema versions.
 * Run: node seed/dropIndexes.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

const run = async () => {
  try {
    const uri = 'mongodb://localhost:27017/securevote';
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Drop entire users collection so all old indexes are gone
    const collections = await db.listCollections({ name: 'users' }).toArray();
    if (collections.length > 0) {
      await db.collection('users').drop();
      console.log('✅ users collection dropped — all stale indexes removed');
    } else {
      console.log('ℹ️  users collection does not exist yet — nothing to drop');
    }

    console.log('\n✅ Done. Now run: npm run seed\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

run();