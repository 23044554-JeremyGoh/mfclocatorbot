// importCentres.js
require('dotenv').config();
const mongoose = require('mongoose');
const Centre = require('./models/Centre');
const centresData = require('./centres.json');

async function importData() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    await Centre.deleteMany(); // Optional: clear existing data
    await Centre.insertMany(centresData);

    console.log('✅ Centres data imported!');
    process.exit();
  } catch (err) {
    console.error('❌ Error importing data:', err);
    process.exit(1);
  }
}

importData();
