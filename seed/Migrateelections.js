/**
 * migrateElections.js - Run ONCE to fix existing elections
 * Run: node seed/migrateElections.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const run = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/securevote');
    console.log('✅ Connected');

    const db = mongoose.connection.db;

    // Add visibleTo to ALL elections missing it
    const r1 = await db.collection('elections').updateMany(
      { visibleTo: { $exists: false } },
      { $set: { visibleTo: ['voter', 'dm', 'sdm', 'cdo'] } }
    );
    console.log(`✅ Added visibleTo to ${r1.modifiedCount} elections`);

    // Also fix elections with empty visibleTo
    const r2 = await db.collection('elections').updateMany(
      { visibleTo: { $size: 0 } },
      { $set: { visibleTo: ['voter', 'dm', 'sdm', 'cdo'] } }
    );
    console.log(`✅ Fixed ${r2.modifiedCount} elections with empty visibleTo`);

    // Show result
    const elections = await db.collection('elections').find({ isActive: true }).toArray();
    console.log('\n📋 Elections after migration:');
    elections.forEach(e => {
      console.log(`  ✔ "${e.title}" → visible to: [${(e.visibleTo||[]).join(', ')}]`);
    });

    console.log('\n✅ Done!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
};
run();